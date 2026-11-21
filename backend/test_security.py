from datetime import date, timedelta
import uuid

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import DatabaseError, connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Campus, User
from apps.audit.models import AuditLog
from apps.courses.models import ActivityGroup, ActivityItem, Course, Enrollment
from apps.courses.services import populate_default_scoring_table


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_unauthenticated_access_blocked_across_protected_endpoints():
    client = APIClient()
    protected_gets = [
        '/api/v1/me/',
        '/api/v1/users/',
        '/api/v1/students/',
        '/api/v1/courses/',
        '/api/v1/enrollments/me/',
        '/api/v1/submissions/',
        '/api/v1/submissions/pending/',
        '/api/v1/notifications/',
        '/api/v1/homologation/summary/',
        '/api/v1/homologation/candidates/',
        '/api/v1/opportunities/',
        '/api/v1/audit/logs/',
    ]
    for url in protected_gets:
        res = client.get(url)
        assert res.status_code == 401, f'Esperava 401 em GET {url}, obteve {res.status_code}'

    # Token JWT adulterado também deve ser rejeitado
    client.credentials(HTTP_AUTHORIZATION='Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxfQ.invalidsig')
    assert client.get('/api/v1/me/').status_code == 401


@pytest.mark.django_db
def test_idor_isolation_between_students_and_courses():
    campus = Campus.objects.create(name='Campus Dois Vizinhos', acronym='DV')
    coord_a = User.objects.create_user(
        email='sec_ca@utfpr.edu.br', institutional_id='SEC_CA',
        full_name='Coord A', campus=campus, primary_role='COURSE_COORD', password='Senha-Forte-2026!x',
    )
    coord_b = User.objects.create_user(
        email='sec_cb@utfpr.edu.br', institutional_id='SEC_CB',
        full_name='Coord B', campus=campus, primary_role='COURSE_COORD', password='Senha-Forte-2026!x',
    )
    prac_a = User.objects.create_user(
        email='sec_pa@utfpr.edu.br', institutional_id='SEC_PA',
        full_name='PRAC A', campus=campus, primary_role='PROFESSOR', password='Senha-Forte-2026!x',
    )
    prac_b = User.objects.create_user(
        email='sec_pb@utfpr.edu.br', institutional_id='SEC_PB',
        full_name='PRAC B', campus=campus, primary_role='PROFESSOR', password='Senha-Forte-2026!x',
    )
    stu_a = User.objects.create_user(
        email='sec_sa@alunos.utfpr.edu.br', institutional_id='a90001',
        full_name='Aluno A', campus=campus, primary_role='STUDENT', password='Senha-Forte-2026!x',
    )
    stu_b = User.objects.create_user(
        email='sec_sb@alunos.utfpr.edu.br', institutional_id='a90002',
        full_name='Aluno B', campus=campus, primary_role='STUDENT', password='Senha-Forte-2026!x',
    )

    course_a = Course.objects.create(
        campus=campus, name='Curso A', code='SEC-A',
        coordinator=coord_a, prac_professor=prac_a, min_total_points=70,
    )
    populate_default_scoring_table(course_a)
    course_b = Course.objects.create(
        campus=campus, name='Curso B', code='SEC-B',
        coordinator=coord_b, prac_professor=prac_b, min_total_points=70,
    )
    populate_default_scoring_table(course_b)

    enr_a = Enrollment.objects.create(
        student=stu_a, course=course_a, enrollment_date=date(2025, 1, 1), status='ACTIVE',
    )
    item_a = ActivityItem.objects.filter(group__course=course_a, is_selectable=True).first()
    group_a = ActivityGroup.objects.filter(course=course_a).first()

    client = APIClient()
    client.force_authenticate(stu_a)
    sub = client.post('/api/v1/submissions/', {
        'enrollment': enr_a.id,
        'activity_item': item_a.id,
        'description': 'Comprovante sigiloso A',
        'activity_start_date': '2025-03-01',
        'activity_end_date': '2025-03-02',
        'declared_quantity': 1,
        'file': SimpleUploadedFile('sigilo.pdf', b'%PDF-1.4\n%sigilo\n%%EOF', content_type='application/pdf'),
    }, format='multipart')
    assert sub.status_code == 201
    sub_id = sub.data['public_id']

    # IDOR entre estudantes (stu_b tentando ler, editar, cancelar, baixar arquivo de stu_a)
    client.force_authenticate(stu_b)
    assert client.get(f'/api/v1/submissions/{sub_id}/').status_code == 403
    assert client.patch(f'/api/v1/submissions/{sub_id}/', {'description': 'Hack'}, format='multipart').status_code == 403
    assert client.delete(f'/api/v1/submissions/{sub_id}/').status_code == 403
    assert client.get(f'/api/v1/submissions/{sub_id}/file/').status_code == 403
    assert client.get(f'/api/v1/courses/{course_a.id}/scoring-table/').status_code == 403

    # IDOR entre cursos: PRAC B e Coord B tentando acessar/avaliar/editar Curso A
    client.force_authenticate(prac_b)
    assert client.get(f'/api/v1/submissions/{sub_id}/file/').status_code == 403
    assert client.post(f'/api/v1/submissions/{sub_id}/evaluate/', {
        'decision': 'APPROVED', 'feedback': 'Invasão',
    }, format='json').status_code == 403
    assert client.post(f'/api/v1/homologation/{enr_a.id}/finalize/').status_code == 403

    client.force_authenticate(coord_b)
    assert client.get(f'/api/v1/courses/{course_a.id}/analytics/').status_code == 403
    assert client.patch(f'/api/v1/courses/{course_a.id}/groups/{group_a.id}/', {'min_points': '0.00'}, format='json').status_code == 403
    assert client.post(f'/api/v1/enrollments/{enr_a.id}/suspensions/', {
        'start_date': '2025-05-01', 'end_date': '2025-05-02', 'reason': 'Invasão',
    }, format='json').status_code == 403

    # Path traversal / UUID inválido no download não vaza arquivos locais
    client.force_authenticate(stu_a)
    assert client.get('/api/v1/submissions/../../etc/passwd/file/').status_code == 404
    assert client.get(f'/api/v1/submissions/{uuid.uuid4()}/file/').status_code == 404


@pytest.mark.django_db
def test_privilege_escalation_malicious_uploads_and_sqli_defenses():
    campus = Campus.objects.create(name='Campus Dois Vizinhos', acronym='DV')
    coord = User.objects.create_user(
        email='sec_coord@utfpr.edu.br', institutional_id='SEC_COORD',
        full_name='Coord', campus=campus, primary_role='COURSE_COORD', password='Senha-Forte-2026!x',
    )
    prac = User.objects.create_user(
        email='sec_prac@utfpr.edu.br', institutional_id='SEC_PRAC',
        full_name='PRAC', campus=campus, primary_role='PROFESSOR', password='Senha-Forte-2026!x',
    )
    stu = User.objects.create_user(
        email='sec_stu@alunos.utfpr.edu.br', institutional_id='a90010',
        full_name='Aluno', campus=campus, primary_role='STUDENT', password='Senha-Forte-2026!x',
    )
    course = Course.objects.create(
        campus=campus, name='BES', code='SEC-BES',
        coordinator=coord, prac_professor=prac, min_total_points=70,
    )
    populate_default_scoring_table(course)
    enr = Enrollment.objects.create(
        student=stu, course=course, enrollment_date=date(2025, 1, 1), status='ACTIVE',
    )
    item = ActivityItem.objects.filter(group__course=course, is_selectable=True).first()

    client = APIClient()

    # SQL Injection no login e na busca
    sqli_login = client.post('/api/v1/auth/login/', {
        'identifier': "' OR '1'='1",
        'password': "' OR '1'='1",
    }, format='json')
    assert sqli_login.status_code == 401

    # Escalação de privilégio bloqueada
    for low_priv in (stu, prac, coord):
        client.force_authenticate(low_priv)
        assert client.post(f'/api/v1/users/{low_priv.public_id}/roles/', {'role': 'SIAC_COORD'}, format='json').status_code == 403
        assert client.get('/api/v1/users/').status_code == 403
        assert client.post('/api/v1/courses/', {
            'campus': campus.id, 'name': 'Hack', 'code': 'HCK',
            'coordinator': coord.id, 'prac_professor': prac.id,
        }, format='json').status_code == 403
        today = timezone.localdate()
        assert client.post('/api/v1/opportunities/', {
            'title': 'Fake', 'description': 'Fake', 'start_date': today.isoformat(),
            'end_date': (today + timedelta(days=1)).isoformat(),
            'modality': 'REMOTO', 'is_external': True,
            'organizer_name': 'Fake', 'certification_rules': 'None',
        }, format='json').status_code == 403

    # Upload malicioso: HTML/XSS e SVG disfarçados de PDF/JPG/PNG são bloqueados por magic bytes
    client.force_authenticate(stu)
    malicious_payloads = [
        SimpleUploadedFile('xss.pdf', b'<html><script>alert(1)</script></html>', content_type='application/pdf'),
        SimpleUploadedFile('xss.jpg', b'<svg onload=alert(1)></svg>', content_type='image/jpeg'),
        SimpleUploadedFile('shell.png', b'#!/bin/sh\nrm -rf /\n', content_type='image/png'),
    ]
    for bad_file in malicious_payloads:
        res = client.post('/api/v1/submissions/', {
            'enrollment': enr.id,
            'activity_item': item.id,
            'description': 'Tentativa XSS/Spoofing',
            'activity_start_date': '2025-03-01',
            'activity_end_date': '2025-03-02',
            'declared_quantity': 1,
            'file': bad_file,
        }, format='multipart')
        assert res.status_code == 400

    # Headers de proteção no download seguro (nosniff e private, no-store)
    ok_res = client.post('/api/v1/submissions/', {
        'enrollment': enr.id,
        'activity_item': item.id,
        'description': 'PDF Legítimo',
        'activity_start_date': '2025-03-01',
        'activity_end_date': '2025-03-02',
        'declared_quantity': 1,
        'file': SimpleUploadedFile('legit.pdf', b'%PDF-1.4\n%legit\n%%EOF', content_type='application/pdf'),
    }, format='multipart')
    assert ok_res.status_code == 201
    dl = client.get(f'/api/v1/submissions/{ok_res.data["public_id"]}/file/')
    assert dl.status_code == 200
    assert dl['X-Content-Type-Options'] == 'nosniff'
    assert 'no-store' in dl['Cache-Control']

    # Imutabilidade da trilha de auditoria contra UPDATE e DELETE direto no PostgreSQL
    with pytest.raises(DatabaseError):
        AuditLog.objects.all().update(action='TAMPERED')
    with pytest.raises(DatabaseError):
        with connection.cursor() as cur:
            cur.execute('DELETE FROM audit.audit_logs')
