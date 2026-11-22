from datetime import date
from io import BytesIO

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import Campus, User
from apps.audit.models import AuditLog
from apps.courses.models import ActivityItem, Course, Enrollment, EnrollmentSuspension
from apps.courses.services import populate_default_scoring_table


def _make_pdf(marker: bytes = b'1') -> SimpleUploadedFile:
    content = b'%PDF-1.4\n% ' + marker + b'\n1 0 obj<</Type/Catalog>>endobj\n%%EOF'
    return SimpleUploadedFile('cert.pdf', content, content_type='application/pdf')


def _make_large_jpg() -> SimpleUploadedFile:
    img = Image.new('RGB', (2800, 2200), color=(40, 120, 200))
    # Adiciona ruído determinístico para gerar arquivo > 500 KB antes da compressão
    px = img.load()
    for x in range(0, 2800, 2):
        for y in range(0, 2200, 2):
            px[x, y] = ((x * 13) % 255, (y * 17) % 255, ((x + y) * 7) % 255)
    buf = BytesIO()
    img.save(buf, format='JPEG', quality=95)
    return SimpleUploadedFile('foto.jpg', buf.getvalue(), content_type='image/jpeg')


@pytest.mark.django_db
def test_full_submission_lifecycle_caps_pillow_and_audit():
    campus = Campus.objects.create(name='Campus Dois Vizinhos', acronym='DV')
    coord = User.objects.create_user(
        email='coord_s@utfpr.edu.br', institutional_id='COORD_S',
        full_name='Coord', campus=campus, primary_role='COURSE_COORD', password='Senha-Forte-2026!x',
    )
    prac = User.objects.create_user(
        email='prac_s@utfpr.edu.br', institutional_id='PRAC_S',
        full_name='PRAC', campus=campus, primary_role='PROFESSOR', password='Senha-Forte-2026!x',
    )
    student = User.objects.create_user(
        email='alu_s@utfpr.edu.br', institutional_id='a20001',
        full_name='Aluno', campus=campus, primary_role='STUDENT', password='Senha-Forte-2026!x',
    )

    course = Course.objects.create(
        campus=campus, name='BES', code='BES-S',
        coordinator=coord, prac_professor=prac, min_total_points=70,
    )
    populate_default_scoring_table(course)
    enrollment = Enrollment.objects.create(
        student=student, course=course, enrollment_date=date(2025, 1, 1), status='ACTIVE',
    )
    EnrollmentSuspension.objects.create(
        enrollment=enrollment, start_date=date(2025, 7, 1), end_date=date(2025, 7, 31), reason='Trancado',
    )

    item_iib = ActivityItem.objects.get(group__course=course, group__group_number=3, code='ii.b')
    item_iid = ActivityItem.objects.get(group__course=course, group__group_number=3, code='ii.d')

    client = APIClient()
    client.force_authenticate(student)

    # 1. Rejeita arquivo com magic bytes inválidos
    bad = client.post('/api/v1/submissions/', {
        'enrollment': enrollment.id,
        'activity_item': item_iib.id,
        'description': 'Falso',
        'activity_start_date': '2025-03-01',
        'activity_end_date': '2025-03-02',
        'declared_quantity': 1,
        'file': SimpleUploadedFile('falso.pdf', b'not a pdf', content_type='application/pdf'),
    }, format='multipart')
    assert bad.status_code == 400

    # 2. Rejeita período de trancamento
    susp = client.post('/api/v1/submissions/', {
        'enrollment': enrollment.id,
        'activity_item': item_iib.id,
        'description': 'No trancamento',
        'activity_start_date': '2025-07-10',
        'activity_end_date': '2025-07-11',
        'declared_quantity': 1,
        'file': _make_pdf(b'susp'),
    }, format='multipart')
    assert susp.status_code == 400

    # 3. Envio com imagem comprimida via Pillow (< 500 KB)
    img_res = client.post('/api/v1/submissions/', {
        'enrollment': enrollment.id,
        'activity_item': item_iib.id,
        'description': 'Congresso Internacional',
        'activity_start_date': '2025-03-10',
        'activity_end_date': '2025-03-12',
        'declared_quantity': 1,
        'file': _make_large_jpg(),
    }, format='multipart')
    assert img_res.status_code == 201
    pub1 = img_res.data['public_id']
    assert img_res.data['semester'] == '2025.1'
    assert img_res.data['calculated_points'] == '9.00'

    # 4. Rejeita arquivo duplicado (SHA-256)
    dup = client.post('/api/v1/submissions/', {
        'enrollment': enrollment.id,
        'activity_item': item_iid.id,
        'description': 'Duplicado',
        'activity_start_date': '2025-04-01',
        'activity_end_date': '2025-04-02',
        'declared_quantity': 1,
        'file': _make_pdf(b'dup1'),
    }, format='multipart')
    assert dup.status_code == 201
    dup2 = client.post('/api/v1/submissions/', {
        'enrollment': enrollment.id,
        'activity_item': item_iid.id,
        'description': 'Duplicado 2',
        'activity_start_date': '2025-04-05',
        'activity_end_date': '2025-04-06',
        'declared_quantity': 1,
        'file': _make_pdf(b'dup1'),
    }, format='multipart')
    assert dup2.status_code == 409

    # 5. Estudante edita pendente; PRAC solicita correção; estudante reenvia; PRAC aprova com ajustes
    edited = client.patch(f'/api/v1/submissions/{dup.data["public_id"]}/', {
        'description': 'Evento Regional Editado',
        'row_version': dup.data['row_version'],
    }, format='multipart')
    assert edited.status_code == 200
    assert edited.data['description'] == 'Evento Regional Editado'

    client.force_authenticate(prac)
    corr = client.post(f'/api/v1/submissions/{pub1}/evaluate/', {
        'decision': 'CORRECTION_REQUESTED',
        'feedback': 'Envie também o verso do certificado.',
    }, format='json')
    assert corr.status_code == 200
    assert corr.data['status'] == 'CORRECTION_REQUESTED'

    client.force_authenticate(student)
    resub = client.put(f'/api/v1/submissions/{pub1}/resubmit/', {
        'description': 'Congresso Internacional Corrigido',
        'file': _make_pdf(b'corrigido'),
    }, format='multipart')
    assert resub.status_code == 200
    assert resub.data['status'] == 'PENDING'

    # Aprova pub1 (9 pts) e depois aprova dup com ajuste (2 eventos x 5 = 10, limitado ao teto 15 do pai ii -> 6 pts!)
    client.force_authenticate(prac)
    ev1 = client.post(f'/api/v1/submissions/{pub1}/evaluate/', {
        'decision': 'APPROVED',
        'feedback': 'Aprovado.',
    }, format='json')
    assert ev1.status_code == 200
    assert ev1.data['approved_points'] == '9.00'

    ev2 = client.post(f'/api/v1/submissions/{dup.data["public_id"]}/evaluate/', {
        'decision': 'APPROVED_WITH_ADJUSTMENTS',
        'validated_quantity': '2.00',
        'feedback': 'Ajustado para 2 eventos e limitado pelo teto compartilhado do item ii.',
    }, format='json')
    assert ev2.status_code == 200
    assert ev2.data['status'] == 'APPROVED_WITH_ADJUSTMENTS'
    assert ev2.data['approved_points'] == '6.00'
    assert ev2.data['was_adjusted'] is True

    # Verifica trilha de auditoria automática gravada pelo PostgreSQL
    assert AuditLog.objects.filter(entity_type='SUBMISSION', action='APPROVED_WITH_ADJUSTMENTS').exists()


def test_derive_semester_and_proof_validation_unit():
    from apps.accounts.db_errors import DomainValidationError
    from apps.submissions.services import derive_semester_from_date, process_and_validate_proof

    assert derive_semester_from_date(date(2025, 1, 15)) == '2025.1'
    assert derive_semester_from_date(date(2025, 6, 30)) == '2025.1'
    assert derive_semester_from_date(date(2025, 7, 1)) == '2025.2'
    assert derive_semester_from_date(date(2025, 12, 20)) == '2025.2'

    with pytest.raises(DomainValidationError):
        process_and_validate_proof(SimpleUploadedFile('empty.pdf', b'', content_type='application/pdf'))

    oversized = SimpleUploadedFile('big.pdf', b'%PDF-1.4\n' + b'0' * (10 * 1024 * 1024), content_type='application/pdf')
    with pytest.raises(DomainValidationError):
        process_and_validate_proof(oversized)

    png_buf = BytesIO()
    Image.new('RGB', (400, 300), color=(10, 90, 150)).save(png_buf, format='PNG')
    ok_png = process_and_validate_proof(
        SimpleUploadedFile('ok.png', png_buf.getvalue(), content_type='image/png')
    )
    assert ok_png['mime_type'] == 'image/png'
    assert ok_png['ext'] == 'png'


@pytest.mark.django_db
def test_submission_date_bounds_cancel_optimistic_lock_rejection_and_revision():
    campus = Campus.objects.create(name='Campus Dois Vizinhos', acronym='DV')
    coord = User.objects.create_user(
        email='coord_sub2@utfpr.edu.br', institutional_id='COORD_SUB2',
        full_name='Coord', campus=campus, primary_role='COURSE_COORD', password='Senha-Forte-2026!x',
    )
    prac = User.objects.create_user(
        email='prac_sub2@utfpr.edu.br', institutional_id='PRAC_SUB2',
        full_name='PRAC', campus=campus, primary_role='PROFESSOR', password='Senha-Forte-2026!x',
    )
    student = User.objects.create_user(
        email='alu_sub2@utfpr.edu.br', institutional_id='a20099',
        full_name='Aluno', campus=campus, primary_role='STUDENT', password='Senha-Forte-2026!x',
    )

    course = Course.objects.create(
        campus=campus, name='BES', code='BES-S2',
        coordinator=coord, prac_professor=prac, min_total_points=70,
    )
    populate_default_scoring_table(course)
    other_course = Course.objects.create(
        campus=campus, name='Outra', code='OUT-S2',
        coordinator=coord, prac_professor=prac, min_total_points=70,
    )
    populate_default_scoring_table(other_course)

    enrollment = Enrollment.objects.create(
        student=student, course=course, enrollment_date=date(2025, 2, 1), status='ACTIVE',
    )
    parent_item = ActivityItem.objects.get(group__course=course, group__group_number=3, code='ii')
    valid_item = ActivityItem.objects.get(group__course=course, group__group_number=3, code='ii.a')
    other_item = ActivityItem.objects.get(group__course=other_course, group__group_number=3, code='ii.a')

    client = APIClient()
    client.force_authenticate(student)

    # Anterior ao ingresso
    before = client.post('/api/v1/submissions/', {
        'enrollment': enrollment.id, 'activity_item': valid_item.id,
        'description': 'Antiga', 'activity_start_date': '2025-01-10', 'activity_end_date': '2025-01-11',
        'declared_quantity': 1, 'file': _make_pdf(b'before'),
    }, format='multipart')
    assert before.status_code == 400

    # Item agrupador não selecionável
    parent_res = client.post('/api/v1/submissions/', {
        'enrollment': enrollment.id, 'activity_item': parent_item.id,
        'description': 'Agrupador', 'activity_start_date': '2025-03-10', 'activity_end_date': '2025-03-11',
        'declared_quantity': 1, 'file': _make_pdf(b'parent'),
    }, format='multipart')
    assert parent_res.status_code == 400

    # Item de outro curso
    wrong_course = client.post('/api/v1/submissions/', {
        'enrollment': enrollment.id, 'activity_item': other_item.id,
        'description': 'Outro curso', 'activity_start_date': '2025-03-10', 'activity_end_date': '2025-03-11',
        'declared_quantity': 1, 'file': _make_pdf(b'wrongcourse'),
    }, format='multipart')
    assert wrong_course.status_code == 400

    # Cria duas submissões válidas
    s1 = client.post('/api/v1/submissions/', {
        'enrollment': enrollment.id, 'activity_item': valid_item.id,
        'description': 'Sub 1', 'activity_start_date': '2025-03-10', 'activity_end_date': '2025-03-11',
        'declared_quantity': 1, 'file': _make_pdf(b'sub1'),
    }, format='multipart')
    assert s1.status_code == 201

    # Lock otimista: row_version desatualizada retorna 409
    stale = client.patch(f'/api/v1/submissions/{s1.data["public_id"]}/', {
        'description': 'Desatualizada', 'row_version': 99,
    }, format='multipart')
    assert stale.status_code == 409

    # Cancelamento pelo aluno
    canceled = client.delete(f'/api/v1/submissions/{s1.data["public_id"]}/')
    assert canceled.status_code == 200
    assert canceled.data['status'] == 'CANCELED'

    # Nova submissão usando o arquivo de s1 cancelada é permitida
    s2 = client.post('/api/v1/submissions/', {
        'enrollment': enrollment.id, 'activity_item': valid_item.id,
        'description': 'Sub 2', 'activity_start_date': '2025-04-01', 'activity_end_date': '2025-04-02',
        'declared_quantity': 1, 'file': _make_pdf(b'sub1'),
    }, format='multipart')
    assert s2.status_code == 201

    # PRAC tenta rejeitar sem feedback -> 400; rejeita com justificativa -> 200
    client.force_authenticate(prac)
    rej_no_fb = client.post(f'/api/v1/submissions/{s2.data["public_id"]}/evaluate/', {
        'decision': 'REJECTED', 'feedback': '',
    }, format='json')
    assert rej_no_fb.status_code == 400

    rej = client.post(f'/api/v1/submissions/{s2.data["public_id"]}/evaluate/', {
        'decision': 'REJECTED', 'feedback': 'Documento ilegível.',
    }, format='json')
    assert rej.status_code == 200
    assert rej.data['status'] == 'REJECTED'

    # Aluno não pode reenviar atividade REJECTED
    client.force_authenticate(student)
    reopen = client.put(f'/api/v1/submissions/{s2.data["public_id"]}/resubmit/', {
        'description': 'Tentativa reenvio',
    }, format='multipart')
    assert reopen.status_code == 409

    # Revisão de parecer (RN007) exige nova justificativa diferente da anterior
    client.force_authenticate(prac)
    same_fb = client.post(f'/api/v1/submissions/{s2.data["public_id"]}/evaluate/', {
        'decision': 'APPROVED', 'feedback': 'Documento ilegível.',
    }, format='json')
    assert same_fb.status_code == 400

    revised = client.post(f'/api/v1/submissions/{s2.data["public_id"]}/evaluate/', {
        'decision': 'APPROVED', 'feedback': 'Reavaliado após conferência do verso original.',
    }, format='json')
    assert revised.status_code == 200
    assert revised.data['status'] == 'APPROVED'
