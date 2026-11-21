from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Campus, User


@pytest.mark.django_db
def test_opportunities_campus_priority_and_siac_coord_only():
    dv = Campus.objects.create(name='Campus Dois Vizinhos', acronym='DV')
    cm = Campus.objects.create(name='Campus Campo Mourão', acronym='CM')
    siac = User.objects.create_user(
        email='siac_o@utfpr.edu.br', institutional_id='SIAC_O',
        full_name='Coord SIAC', campus=dv, primary_role='SIAC_COORD', password='Senha-Forte-2026!x',
    )
    student = User.objects.create_user(
        email='stu_o@utfpr.edu.br', institutional_id='a40001',
        full_name='Aluno', campus=dv, primary_role='STUDENT', password='Senha-Forte-2026!x',
    )

    today = timezone.localdate()
    client = APIClient()
    client.force_authenticate(siac)

    # Cria evento em CM, evento global externo e evento em DV
    client.post('/api/v1/opportunities/', {
        'title': 'Evento CM',
        'description': 'Outro campus',
        'campus': cm.id,
        'start_date': (today + timedelta(days=1)).isoformat(),
        'end_date': (today + timedelta(days=2)).isoformat(),
        'modality': 'PRESENCIAL',
        'is_external': False,
        'organizer_name': 'CM',
        'certification_rules': 'Certificado',
    }, format='json')
    client.post('/api/v1/opportunities/', {
        'title': 'Evento DV',
        'description': 'Meu campus',
        'campus': dv.id,
        'start_date': (today + timedelta(days=3)).isoformat(),
        'end_date': (today + timedelta(days=4)).isoformat(),
        'modality': 'PRESENCIAL',
        'is_external': False,
        'organizer_name': 'DV',
        'certification_rules': 'Certificado',
    }, format='json')
    client.post('/api/v1/opportunities/', {
        'title': 'Evento Expirado',
        'description': 'Passado',
        'campus': dv.id,
        'start_date': (today - timedelta(days=10)).isoformat(),
        'end_date': (today - timedelta(days=5)).isoformat(),
        'modality': 'REMOTO',
        'is_external': True,
        'organizer_name': 'Ext',
        'certification_rules': 'Certificado',
    }, format='json')

    client.force_authenticate(student)
    res = client.get('/api/v1/opportunities/')
    assert res.status_code == 200
    titles = [item['title'] for item in res.data]
    assert 'Evento Expirado' not in titles
    assert titles[0] == 'Evento DV'

    denied = client.post('/api/v1/opportunities/', {'title': 'X'}, format='json')
    assert denied.status_code == 403


@pytest.mark.django_db
def test_opportunity_update_deactivate_filters_and_validation():
    dv = Campus.objects.create(name='Campus Dois Vizinhos', acronym='DV')
    siac = User.objects.create_user(
        email='siac_o2@utfpr.edu.br', institutional_id='SIAC_O2',
        full_name='Coord SIAC', campus=dv, primary_role='SIAC_COORD', password='Senha-Forte-2026!x',
    )
    coord = User.objects.create_user(
        email='coord_o2@utfpr.edu.br', institutional_id='COORD_O2',
        full_name='Coord Curso', campus=dv, primary_role='COURSE_COORD', password='Senha-Forte-2026!x',
    )
    today = timezone.localdate()

    client = APIClient()
    client.force_authenticate(siac)

    # Data final anterior à inicial retorna 400
    invalid = client.post('/api/v1/opportunities/', {
        'title': 'Datas Inválidas',
        'description': 'Erro',
        'campus': dv.id,
        'start_date': (today + timedelta(days=5)).isoformat(),
        'end_date': (today + timedelta(days=1)).isoformat(),
        'modality': 'REMOTO',
        'is_external': True,
        'organizer_name': 'UTFPR',
        'certification_rules': 'Certificado',
    }, format='json')
    assert invalid.status_code == 400

    created = client.post('/api/v1/opportunities/', {
        'title': 'Semana Acadêmica BES',
        'description': 'Palestras técnicas',
        'campus': dv.id,
        'suggested_group_number': 3,
        'suggested_item_code': 'ii.a',
        'start_date': (today + timedelta(days=2)).isoformat(),
        'end_date': (today + timedelta(days=4)).isoformat(),
        'modality': 'HIBRIDO',
        'is_external': False,
        'organizer_name': 'DACOMP',
        'certification_rules': 'Frequência mínima de 75%',
    }, format='json')
    assert created.status_code == 201
    pub_id = created.data['public_id']

    # Filtros por grupo e modalidade
    filtered = client.get('/api/v1/opportunities/?group_number=3&modality=HIBRIDO')
    assert filtered.status_code == 200
    assert len(filtered.data) == 1

    # COURSE_COORD não pode editar oportunidade
    client.force_authenticate(coord)
    assert client.patch(f'/api/v1/opportunities/{pub_id}/', {'title': 'Hack'}, format='json').status_code == 403

    # SIAC_COORD encerra (desativa) a oportunidade e estudante não a vê mais
    client.force_authenticate(siac)
    closed = client.patch(f'/api/v1/opportunities/{pub_id}/', {'is_active': False}, format='json')
    assert closed.status_code == 200
    assert closed.data['is_active'] is False

    client.force_authenticate(coord)
    after_close = client.get('/api/v1/opportunities/')
    assert all(item['public_id'] != pub_id for item in after_close.data)
