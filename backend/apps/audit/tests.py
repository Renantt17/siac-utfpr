import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Campus, User


@pytest.mark.django_db
def test_audit_endpoint_restricted_to_coordination():
    campus = Campus.objects.create(name='Campus Dois Vizinhos', acronym='DV')
    siac = User.objects.create_user(
        email='siac_a@utfpr.edu.br', institutional_id='SIAC_A',
        full_name='Coord SIAC', campus=campus, primary_role='SIAC_COORD', password='Senha-Forte-2026!x',
    )
    student = User.objects.create_user(
        email='stu_a@utfpr.edu.br', institutional_id='a50001',
        full_name='Aluno', campus=campus, primary_role='STUDENT', password='Senha-Forte-2026!x',
    )

    client = APIClient()
    client.force_authenticate(student)
    assert client.get('/api/v1/audit/logs/').status_code == 403

    client.force_authenticate(siac)
    res = client.get('/api/v1/audit/logs/')
    assert res.status_code == 200
    assert any(log['entity_type'] == 'USER_ROLE' for log in res.data)


@pytest.mark.django_db
def test_audit_course_coord_only_sees_own_course_logs_and_entity_filter():
    from apps.accounts.context import set_db_audit_context
    from apps.courses.models import Course

    campus = Campus.objects.create(name='Campus Dois Vizinhos', acronym='DV')
    siac = User.objects.create_user(
        email='siac_a2@utfpr.edu.br', institutional_id='SIAC_A2',
        full_name='Coord SIAC', campus=campus, primary_role='SIAC_COORD', password='Senha-Forte-2026!x',
    )
    coord_a = User.objects.create_user(
        email='coord_a2@utfpr.edu.br', institutional_id='COORD_A2',
        full_name='Coord A', campus=campus, primary_role='COURSE_COORD', password='Senha-Forte-2026!x',
    )
    coord_b = User.objects.create_user(
        email='coord_b2@utfpr.edu.br', institutional_id='COORD_B2',
        full_name='Coord B', campus=campus, primary_role='COURSE_COORD', password='Senha-Forte-2026!x',
    )
    prac = User.objects.create_user(
        email='prac_a2@utfpr.edu.br', institutional_id='PRAC_A2',
        full_name='PRAC', campus=campus, primary_role='PROFESSOR', password='Senha-Forte-2026!x',
    )

    set_db_audit_context(siac.id, '127.0.0.1')
    course_a = Course.objects.create(
        campus=campus, name='Curso A', code='CUR-A',
        coordinator=coord_a, prac_professor=prac, min_total_points=70,
    )
    course_b = Course.objects.create(
        campus=campus, name='Curso B', code='CUR-B',
        coordinator=coord_b, prac_professor=prac, min_total_points=70,
    )

    client = APIClient()
    client.force_authenticate(prac)
    assert client.get('/api/v1/audit/logs/').status_code == 403

    client.force_authenticate(coord_a)
    logs_a = client.get('/api/v1/audit/logs/?entity_type=COURSE')
    assert logs_a.status_code == 200
    entity_ids = {log['entity_id'] for log in logs_a.data}
    assert course_a.id in entity_ids
    assert course_b.id not in entity_ids
