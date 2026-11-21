from datetime import date

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Campus, User
from apps.courses.models import ActivityGroup, Course, Enrollment


@pytest.mark.django_db
def test_course_creation_with_default_table_and_enrollment_suspension():
    campus = Campus.objects.create(name='Campus Dois Vizinhos', acronym='DV')
    siac = User.objects.create_user(
        email='siac_c@utfpr.edu.br', institutional_id='SIAC01',
        full_name='Coord SIAC', campus=campus, primary_role='SIAC_COORD', password='Senha-Forte-2026!x',
    )
    coord = User.objects.create_user(
        email='coord_c@utfpr.edu.br', institutional_id='COORD01',
        full_name='Coord Curso', campus=campus, primary_role='COURSE_COORD', password='Senha-Forte-2026!x',
    )
    prac = User.objects.create_user(
        email='prac_c@utfpr.edu.br', institutional_id='PRAC01',
        full_name='Prof PRAC', campus=campus, primary_role='PROFESSOR', password='Senha-Forte-2026!x',
    )
    student = User.objects.create_user(
        email='stu_c@utfpr.edu.br', institutional_id='a10001',
        full_name='Aluno', campus=campus, primary_role='STUDENT', password='Senha-Forte-2026!x',
    )

    client = APIClient()
    client.force_authenticate(siac)
    created = client.post('/api/v1/courses/', {
        'campus': campus.id,
        'name': 'Engenharia de Software',
        'code': 'BES-DV',
        'coordinator': coord.id,
        'prac_professor': prac.id,
        'min_total_points': '70.00',
    }, format='json')
    assert created.status_code == 201
    course_id = created.data['id']
    assert ActivityGroup.objects.filter(course_id=course_id).count() == 3

    # Estudante não pode criar matrícula
    client.force_authenticate(student)
    denied = client.post('/api/v1/enrollments/', {
        'student_id': student.id,
        'course_id': course_id,
        'enrollment_date': '2025-03-01',
    }, format='json')
    assert denied.status_code == 403

    # Coord. de curso cria matrícula e trancamento; GiST bloqueia sobreposição
    client.force_authenticate(coord)
    enr = client.post('/api/v1/enrollments/', {
        'student_id': student.id,
        'course_id': course_id,
        'enrollment_date': '2025-03-01',
    }, format='json')
    assert enr.status_code == 201
    enrollment_id = enr.data['id']

    s1 = client.post(f'/api/v1/enrollments/{enrollment_id}/suspensions/', {
        'start_date': '2025-08-01',
        'end_date': '2025-12-15',
        'reason': 'Mobilidade',
    }, format='json')
    assert s1.status_code == 201

    s2 = client.post(f'/api/v1/enrollments/{enrollment_id}/suspensions/', {
        'start_date': '2025-10-01',
        'end_date': '2025-12-20',
        'reason': 'Sobreposto',
    }, format='json')
    assert s2.status_code == 409

    # Exclusão de grupo sem submissões faz DELETE físico; analytics funciona
    g1 = ActivityGroup.objects.get(course_id=course_id, group_number=1)
    analytics = client.get(f'/api/v1/courses/{course_id}/analytics/')
    assert analytics.status_code == 200
    assert analytics.data['students_count'] == 1

    deleted = client.delete(f'/api/v1/courses/{course_id}/groups/{g1.id}/')
    assert deleted.status_code == 200
    assert deleted.data['outcome'] == 'DELETED'
    assert Course.objects.filter(pk=course_id).exists()
    assert Enrollment.objects.filter(pk=enrollment_id).exists()


@pytest.mark.django_db
def test_scoring_table_is_isolated_per_course_and_soft_deactivates_when_used():
    from django.core.files.uploadedfile import SimpleUploadedFile
    from apps.courses.models import ActivityItem

    campus = Campus.objects.create(name='Campus Dois Vizinhos', acronym='DV')
    siac = User.objects.create_user(
        email='siac_iso@utfpr.edu.br', institutional_id='SIAC_ISO',
        full_name='SIAC', campus=campus, primary_role='SIAC_COORD', password='Senha-Forte-2026!x',
    )
    coord_a = User.objects.create_user(
        email='coord_a@utfpr.edu.br', institutional_id='COORD_A',
        full_name='Coord A', campus=campus, primary_role='COURSE_COORD', password='Senha-Forte-2026!x',
    )
    coord_b = User.objects.create_user(
        email='coord_b@utfpr.edu.br', institutional_id='COORD_B',
        full_name='Coord B', campus=campus, primary_role='COURSE_COORD', password='Senha-Forte-2026!x',
    )
    prac = User.objects.create_user(
        email='prac_iso@utfpr.edu.br', institutional_id='PRAC_ISO',
        full_name='PRAC', campus=campus, primary_role='PROFESSOR', password='Senha-Forte-2026!x',
    )
    student_a = User.objects.create_user(
        email='stu_a_iso@utfpr.edu.br', institutional_id='a77001',
        full_name='Aluno A', campus=campus, primary_role='STUDENT', password='Senha-Forte-2026!x',
    )

    client = APIClient()
    client.force_authenticate(siac)
    ca = client.post('/api/v1/courses/', {
        'campus': campus.id, 'name': 'Eng. Software', 'code': 'BES',
        'coordinator': coord_a.id, 'prac_professor': prac.id, 'min_total_points': '70.00',
    }, format='json').data
    cb = client.post('/api/v1/courses/', {
        'campus': campus.id, 'name': 'Zootecnia', 'code': 'ZOO',
        'coordinator': coord_b.id, 'prac_professor': prac.id, 'min_total_points': '70.00',
    }, format='json').data

    # Coord A altera meta e grupo apenas do Curso A; Curso B não muda
    client.force_authenticate(coord_a)
    upd_a = client.patch(f'/api/v1/courses/{ca["id"]}/', {'min_total_points': '90.00'}, format='json')
    assert upd_a.status_code == 200

    # Coord A não pode alterar código/coordenador nem mexer no Curso B
    forbidden_field = client.patch(f'/api/v1/courses/{ca["id"]}/', {'code': 'HACK'}, format='json')
    assert forbidden_field.status_code == 403
    forbidden_other = client.patch(f'/api/v1/courses/{cb["id"]}/', {'min_total_points': '10.00'}, format='json')
    assert forbidden_other.status_code == 403

    cb_obj = Course.objects.get(pk=cb['id'])
    assert str(cb_obj.min_total_points) == '70.00'

    # Cria matrícula e submissão no Grupo 1 do Curso A -> delete do grupo vira DEACTIVATED
    enr = client.post('/api/v1/enrollments/', {
        'student_id': student_a.id, 'course_id': ca['id'], 'enrollment_date': '2025-01-01',
    }, format='json')
    assert enr.status_code == 201

    dup_enr = client.post('/api/v1/enrollments/', {
        'student_id': student_a.id, 'course_id': ca['id'], 'enrollment_date': '2025-01-01',
    }, format='json')
    assert dup_enr.status_code == 409

    bad_susp = client.post(f'/api/v1/enrollments/{enr.data["id"]}/suspensions/', {
        'start_date': '2025-06-10', 'end_date': '2025-06-01', 'reason': 'Invertida',
    }, format='json')
    assert bad_susp.status_code == 400

    g1_a = ActivityGroup.objects.get(course_id=ca['id'], group_number=1)
    item_g1 = ActivityItem.objects.filter(group=g1_a, is_selectable=True).first()
    client.force_authenticate(student_a)
    sub = client.post('/api/v1/submissions/', {
        'enrollment': enr.data['id'],
        'activity_item': item_g1.id,
        'description': 'Monitoria',
        'activity_start_date': '2025-03-01',
        'activity_end_date': '2025-03-30',
        'declared_quantity': 1,
        'file': SimpleUploadedFile('mon.pdf', b'%PDF-1.4\n%mon\n%%EOF', content_type='application/pdf'),
    }, format='multipart')
    assert sub.status_code == 201

    client.force_authenticate(coord_a)
    soft_del = client.delete(f'/api/v1/courses/{ca["id"]}/groups/{g1_a.id}/')
    assert soft_del.status_code == 200
    assert soft_del.data['outcome'] == 'DEACTIVATED'
    g1_a.refresh_from_db()
    assert g1_a.is_active is False
