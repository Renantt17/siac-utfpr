import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Campus, User


@pytest.mark.django_db
def test_hybrid_login_by_ra_and_email_and_no_public_register():
    campus = Campus.objects.create(name='Campus Dois Vizinhos', acronym='DV')
    student = User.objects.create_user(
        email='aluno@alunos.utfpr.edu.br',
        institutional_id='a2500999',
        full_name='Estudante Teste',
        campus=campus,
        primary_role='STUDENT',
        password='Senha-Forte-2026!x',
    )
    siac_coord = User.objects.create_user(
        email='siac@utfpr.edu.br',
        institutional_id='SIAC999',
        full_name='Coord SIAC',
        campus=campus,
        primary_role='SIAC_COORD',
        password='Senha-Forte-2026!x',
    )

    client = APIClient()

    # Auto-cadastro público não existe mais (MVP pré-cadastrado)
    reg = client.post('/api/v1/register/', {'email': 'x@x.com'})
    assert reg.status_code == 404

    # Login por RA
    res_ra = client.post('/api/v1/auth/login/', {
        'identifier': 'a2500999',
        'password': 'Senha-Forte-2026!x',
    }, format='json')
    assert res_ra.status_code == 200
    assert res_ra.data['user']['roles'] == ['STUDENT']

    # Login por e-mail
    res_email = client.post('/api/v1/auth/login/', {
        'identifier': 'siac@utfpr.edu.br',
        'password': 'Senha-Forte-2026!x',
    }, format='json')
    assert res_email.status_code == 200
    assert res_email.data['user']['roles'] == ['SIAC_COORD']

    # Gestão de papéis restrita ao SIAC_COORD
    client.force_authenticate(student)
    denied = client.post(f'/api/v1/users/{student.public_id}/roles/', {'role': 'PROFESSOR'}, format='json')
    assert denied.status_code == 403

    client.force_authenticate(siac_coord)
    granted = client.post(f'/api/v1/users/{student.public_id}/roles/', {'role': 'PROFESSOR'}, format='json')
    assert granted.status_code == 200
    assert set(granted.data['roles']) == {'STUDENT', 'PROFESSOR'}

    revoked = client.delete(f'/api/v1/users/{student.public_id}/roles/', {'role': 'PROFESSOR'}, format='json')
    assert revoked.status_code == 200
    assert revoked.data['roles'] == ['STUDENT']


@pytest.mark.django_db
def test_login_supports_both_identifiers_across_roles_and_rejects_invalid():
    campus = Campus.objects.create(name='Campus Dois Vizinhos', acronym='DV')
    User.objects.create_user(
        email='stu.flex@alunos.utfpr.edu.br',
        institutional_id='a2500888',
        full_name='Estudante Flex',
        campus=campus,
        primary_role='STUDENT',
        password='Senha-Forte-2026!x',
    )
    User.objects.create_user(
        email='prof.flex@utfpr.edu.br',
        institutional_id='SIAPE888',
        full_name='Prof Flex',
        campus=campus,
        primary_role='PROFESSOR',
        password='Senha-Forte-2026!x',
    )
    inactive = User.objects.create_user(
        email='inativo@utfpr.edu.br',
        institutional_id='INAT001',
        full_name='Inativo',
        campus=campus,
        primary_role='STUDENT',
        password='Senha-Forte-2026!x',
    )
    inactive.is_active = False
    inactive.save(update_fields=['is_active'])

    client = APIClient()

    # Estudante também consegue entrar por e-mail; servidor também por código institucional
    stu_email = client.post('/api/v1/auth/login/', {
        'identifier': 'STU.FLEX@alunos.utfpr.edu.br',
        'password': 'Senha-Forte-2026!x',
    }, format='json')
    assert stu_email.status_code == 200
    assert stu_email.data['user']['institutional_id'] == 'a2500888'

    prof_code = client.post('/api/v1/auth/login/', {
        'identifier': 'siape888',
        'password': 'Senha-Forte-2026!x',
    }, format='json')
    assert prof_code.status_code == 200
    assert prof_code.data['user']['roles'] == ['PROFESSOR']

    # Senha errada, usuário inativo e identificador vazio são rejeitados
    bad_pw = client.post('/api/v1/auth/login/', {
        'identifier': 'a2500888',
        'password': 'errada',
    }, format='json')
    assert bad_pw.status_code == 401

    inactive_res = client.post('/api/v1/auth/login/', {
        'identifier': 'INAT001',
        'password': 'Senha-Forte-2026!x',
    }, format='json')
    assert inactive_res.status_code == 401

    blank_res = client.post('/api/v1/auth/login/', {
        'identifier': '   ',
        'password': 'Senha-Forte-2026!x',
    }, format='json')
    assert blank_res.status_code == 400


@pytest.mark.django_db
def test_role_revocation_protects_primary_role_and_validates_role_name():
    campus = Campus.objects.create(name='Campus Dois Vizinhos', acronym='DV')
    siac = User.objects.create_user(
        email='siac_r@utfpr.edu.br',
        institutional_id='SIAC_R',
        full_name='Coord SIAC',
        campus=campus,
        primary_role='SIAC_COORD',
        password='Senha-Forte-2026!x',
    )
    target = User.objects.create_user(
        email='alvo_r@utfpr.edu.br',
        institutional_id='ALVO_R',
        full_name='Alvo',
        campus=campus,
        primary_role='PROFESSOR',
        password='Senha-Forte-2026!x',
    )

    client = APIClient()
    client.force_authenticate(siac)

    # Não pode remover primary_role
    rem_primary = client.delete(
        f'/api/v1/users/{target.public_id}/roles/',
        {'role': 'PROFESSOR'},
        format='json',
    )
    assert rem_primary.status_code == 400

    # Papel inexistente retorna 400
    bad_role = client.post(
        f'/api/v1/users/{target.public_id}/roles/',
        {'role': 'SUPER_ADMIN'},
        format='json',
    )
    assert bad_role.status_code == 400
