from datetime import date

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import DatabaseError
from rest_framework.test import APIClient

from apps.accounts.models import Campus, User
from apps.audit.models import AuditLog
from apps.courses.models import ActivityItem, Course, Enrollment
from apps.courses.services import populate_default_scoring_table


def _pdf(tag: bytes) -> SimpleUploadedFile:
    return SimpleUploadedFile(f'{tag.decode()}.pdf', b'%PDF-1.4\n%' + tag + b'\n%%EOF', content_type='application/pdf')


@pytest.mark.django_db
def test_homologation_requires_all_groups_freezes_enrollment_and_audit_immutable():
    campus = Campus.objects.create(name='Campus Dois Vizinhos', acronym='DV')
    coord = User.objects.create_user(
        email='coord_h@utfpr.edu.br', institutional_id='COORD_H',
        full_name='Coord', campus=campus, primary_role='COURSE_COORD', password='Senha-Forte-2026!x',
    )
    prac = User.objects.create_user(
        email='prac_h@utfpr.edu.br', institutional_id='PRAC_H',
        full_name='PRAC', campus=campus, primary_role='PROFESSOR', password='Senha-Forte-2026!x',
    )
    student = User.objects.create_user(
        email='alu_h@utfpr.edu.br', institutional_id='a30001',
        full_name='Aluno Homolog', campus=campus, primary_role='STUDENT', password='Senha-Forte-2026!x',
    )

    course = Course.objects.create(
        campus=campus, name='BES', code='BES-H',
        coordinator=coord, prac_professor=prac, min_total_points=70,
    )
    populate_default_scoring_table(course)
    enrollment = Enrollment.objects.create(
        student=student, course=course, enrollment_date=date(2024, 1, 1), status='ACTIVE',
    )

    # Itens: G1 v (10 pts/part, max 10/sem -> 2 semestres = 20 pts)
    # G2 viii (10 pts/camp, max 10/sem -> 2 semestres = 20 pts)
    # G3 viii.a (30 pts/pub, max 30/sem -> 1 pub = 30 pts) => Total = 70 pts!
    g1_item = ActivityItem.objects.get(group__course=course, group__group_number=1, code='v')
    g2_item = ActivityItem.objects.get(group__course=course, group__group_number=2, code='viii')
    g3_item = ActivityItem.objects.get(group__course=course, group__group_number=3, code='viii.a')

    client = APIClient()

    sub_specs = [
        (g1_item, '2024-03-01', '2024-03-05', b'h1'),
        (g1_item, '2024-09-01', '2024-09-05', b'h2'),
        (g2_item, '2024-04-01', '2024-04-05', b'h3'),
        (g2_item, '2024-10-01', '2024-10-05', b'h4'),
        (g3_item, '2025-03-01', '2025-03-05', b'h5'),
    ]

    for idx, (item, start, end, tag) in enumerate(sub_specs):
        client.force_authenticate(student)
        res = client.post('/api/v1/submissions/', {
            'enrollment': enrollment.id,
            'activity_item': item.id,
            'description': f'Atividade {idx}',
            'activity_start_date': start,
            'activity_end_date': end,
            'declared_quantity': 1,
            'file': _pdf(tag),
        }, format='multipart')
        assert res.status_code == 201

        client.force_authenticate(prac)
        ev = client.post(f'/api/v1/submissions/{res.data["public_id"]}/evaluate/', {
            'decision': 'APPROVED',
            'feedback': 'OK',
        }, format='json')
        assert ev.status_code == 200

        if idx == 0:
            # Tentativa prematura de homologar deve falhar
            premature = client.post(f'/api/v1/homologation/{enrollment.id}/finalize/')
            assert premature.status_code == 400

    # Agora elegível (20 + 20 + 30 = 70)
    client.force_authenticate(prac)
    hom = client.post(f'/api/v1/homologation/{enrollment.id}/finalize/')
    assert hom.status_code == 201
    assert hom.data['total_approved_points'] == '70.00'
    hom_public_id = hom.data['public_id']

    # Matrícula foi congelada para COMPLETED pela função fn_register_homologation
    enrollment.refresh_from_db()
    assert enrollment.status == 'COMPLETED'

    # Estudante confirma relatório e baixa PDF
    client.force_authenticate(student)
    conf = client.post(f'/api/v1/homologation/{hom_public_id}/confirm/')
    assert conf.status_code == 200
    assert conf.data['student_confirmed_at'] is not None

    pdf_res = client.get(f'/api/v1/homologation/{hom_public_id}/report/')
    assert pdf_res.status_code == 200
    assert pdf_res['Content-Type'] == 'application/pdf'

    # Nova submissão após homologação é bloqueada
    blocked = client.post('/api/v1/submissions/', {
        'enrollment': enrollment.id,
        'activity_item': g1_item.id,
        'description': 'Após conclusão',
        'activity_start_date': '2025-05-01',
        'activity_end_date': '2025-05-02',
        'declared_quantity': 1,
        'file': _pdf(b'after'),
    }, format='multipart')
    assert blocked.status_code == 400

    # Tentativa de apagar auditoria pela role siac_app é bloqueada pelo PostgreSQL
    with pytest.raises(DatabaseError):
        AuditLog.objects.all().delete()


@pytest.mark.django_db
def test_homologation_blocks_missing_group_pending_duplicate_and_foreign_confirm():
    campus = Campus.objects.create(name='Campus Dois Vizinhos', acronym='DV')
    coord = User.objects.create_user(
        email='coord_h2@utfpr.edu.br', institutional_id='COORD_H2',
        full_name='Coord', campus=campus, primary_role='COURSE_COORD', password='Senha-Forte-2026!x',
    )
    prac = User.objects.create_user(
        email='prac_h2@utfpr.edu.br', institutional_id='PRAC_H2',
        full_name='PRAC', campus=campus, primary_role='PROFESSOR', password='Senha-Forte-2026!x',
    )
    student1 = User.objects.create_user(
        email='alu_h2_1@utfpr.edu.br', institutional_id='a30091',
        full_name='Aluno 1', campus=campus, primary_role='STUDENT', password='Senha-Forte-2026!x',
    )
    student2 = User.objects.create_user(
        email='alu_h2_2@utfpr.edu.br', institutional_id='a30092',
        full_name='Aluno 2', campus=campus, primary_role='STUDENT', password='Senha-Forte-2026!x',
    )

    course = Course.objects.create(
        campus=campus, name='BES', code='BES-H2',
        coordinator=coord, prac_professor=prac, min_total_points=50,
    )
    populate_default_scoring_table(course)
    enrollment = Enrollment.objects.create(
        student=student1, course=course, enrollment_date=date(2024, 1, 1), status='ACTIVE',
    )

    # Atinge 50 pontos só com G1 (20) + G3 (30), deixando G2 zerado -> NÃO elegível!
    g1_item = ActivityItem.objects.get(group__course=course, group__group_number=1, code='v')
    g2_item = ActivityItem.objects.get(group__course=course, group__group_number=2, code='viii')
    g3_item = ActivityItem.objects.get(group__course=course, group__group_number=3, code='viii.a')

    client = APIClient()
    for idx, (item, start, end, tag) in enumerate([
        (g1_item, '2024-03-01', '2024-03-02', b'g1a'),
        (g1_item, '2024-09-01', '2024-09-02', b'g1b'),
        (g3_item, '2024-04-01', '2024-04-02', b'g3a'),
    ]):
        client.force_authenticate(student1)
        r = client.post('/api/v1/submissions/', {
            'enrollment': enrollment.id, 'activity_item': item.id, 'description': f'A{idx}',
            'activity_start_date': start, 'activity_end_date': end,
            'declared_quantity': 1, 'file': _pdf(tag),
        }, format='multipart')
        assert r.status_code == 201
        client.force_authenticate(prac)
        assert client.post(f'/api/v1/submissions/{r.data["public_id"]}/evaluate/', {
            'decision': 'APPROVED', 'feedback': 'OK',
        }, format='json').status_code == 200

    client.force_authenticate(prac)
    missing_g2 = client.post(f'/api/v1/homologation/{enrollment.id}/finalize/')
    assert missing_g2.status_code == 400

    # Completa G2 (20 pts) e cria mais 1 pendente -> ainda bloqueado por haver submissão pendente
    for start, end, tag in [('2024-03-10', '2024-03-11', b'g2a'), ('2024-09-10', '2024-09-11', b'g2b')]:
        client.force_authenticate(student1)
        r = client.post('/api/v1/submissions/', {
            'enrollment': enrollment.id, 'activity_item': g2_item.id, 'description': 'G2',
            'activity_start_date': start, 'activity_end_date': end,
            'declared_quantity': 1, 'file': _pdf(tag),
        }, format='multipart')
        client.force_authenticate(prac)
        client.post(f'/api/v1/submissions/{r.data["public_id"]}/evaluate/', {
            'decision': 'APPROVED', 'feedback': 'OK',
        }, format='json')

    client.force_authenticate(student1)
    pending = client.post('/api/v1/submissions/', {
        'enrollment': enrollment.id, 'activity_item': g1_item.id, 'description': 'Pendente',
        'activity_start_date': '2025-03-01', 'activity_end_date': '2025-03-02',
        'declared_quantity': 1, 'file': _pdf(b'pend'),
    }, format='multipart')
    assert pending.status_code == 201

    client.force_authenticate(prac)
    blocked_by_pending = client.post(f'/api/v1/homologation/{enrollment.id}/finalize/')
    assert blocked_by_pending.status_code == 400

    # Cancela pendente, homologa, bloqueia 2ª homologação e bloqueia confirmação por outro estudante
    client.force_authenticate(student1)
    client.delete(f'/api/v1/submissions/{pending.data["public_id"]}/')

    client.force_authenticate(prac)
    hom = client.post(f'/api/v1/homologation/{enrollment.id}/finalize/')
    assert hom.status_code == 201

    dup_hom = client.post(f'/api/v1/homologation/{enrollment.id}/finalize/')
    assert dup_hom.status_code == 409

    client.force_authenticate(student2)
    other_confirm = client.post(f'/api/v1/homologation/{hom.data["public_id"]}/confirm/')
    assert other_confirm.status_code == 403
