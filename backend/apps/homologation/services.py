from decimal import Decimal
import hashlib
from io import BytesIO
from xml.sax.saxutils import escape

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import DatabaseError, connection, transaction
from django.db.models import Sum
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from apps.accounts.context import set_db_audit_context
from apps.accounts.db_errors import (
    DomainConflictError,
    DomainPermissionError,
    DomainValidationError,
    raise_mapped_db_error,
)
from apps.accounts.permissions import can_evaluate_course, can_manage_enrollments
from apps.courses.models import Enrollment
from apps.submissions.models import Notification, Submission
from .models import Homologation


APPROVED_STATUSES = ('APPROVED', 'APPROVED_WITH_ADJUSTMENTS')


def _compute_enrollment_progress(enrollment: Enrollment) -> dict:
    submissions = Submission.objects.filter(enrollment=enrollment).select_related(
        'activity_item__group'
    )
    approved = submissions.filter(status__in=APPROVED_STATUSES)
    total_points = approved.aggregate(total=Sum('approved_points'))['total'] or Decimal('0.00')

    groups = []
    all_groups_reached = True
    active_groups = list(enrollment.course.activity_groups.filter(is_active=True).order_by('group_number'))
    if not active_groups:
        all_groups_reached = False

    for group in active_groups:
        group_pts = (
            approved.filter(activity_item__group=group).aggregate(total=Sum('approved_points'))['total']
            or Decimal('0.00')
        )
        reached = group_pts >= group.min_points
        if not reached:
            all_groups_reached = False
        groups.append({
            'group_id': group.id,
            'group_number': group.group_number,
            'title': group.title,
            'approved_points': group_pts,
            'required_min_points': group.min_points,
            'minimum_reached': reached,
            'activity_limits': list(
                group.activity_items.filter(is_active=True, is_selectable=True).values(
                    'id',
                    'code',
                    'description',
                    'points_per_unit',
                    'unit_name',
                    'max_points_semester',
                )
            ),
        })

    pending_cnt = submissions.filter(status='PENDING').count()
    correction_cnt = submissions.filter(status='CORRECTION_REQUESTED').count()
    approved_cnt = submissions.filter(status__in=APPROVED_STATUSES).count()
    rejected_cnt = submissions.filter(status='REJECTED').count()

    has_open = (pending_cnt + correction_cnt) > 0
    total_reached = total_points >= enrollment.course.min_total_points
    eligible = (
        enrollment.status == 'ACTIVE'
        and not hasattr(enrollment, 'homologation')
        and not has_open
        and all_groups_reached
        and total_reached
    )

    return {
        'total_approved_points': total_points,
        'required_min_total_points': enrollment.course.min_total_points,
        'minimum_reached': total_reached and all_groups_reached,
        'eligible_for_homologation': eligible,
        'approved_submissions': approved_cnt,
        'pending_submissions': pending_cnt,
        'correction_submissions': correction_cnt,
        'rejected_submissions': rejected_cnt,
        'groups': groups,
        'approved_qs': approved.order_by('semester', 'activity_item__group__group_number', 'created_at'),
    }


def get_student_summary(student) -> list[dict]:
    enrollments = (
        Enrollment.objects.filter(student=student, course__is_active=True)
        .exclude(status='CANCELED')
        .select_related('course', 'course__campus')
        .prefetch_related('course__activity_groups')
        .order_by('course__name')
    )
    results = []
    for enrollment in enrollments:
        progress = _compute_enrollment_progress(enrollment)
        approved_qs = progress.pop('approved_qs')
        by_semester = {}
        for sub in approved_qs:
            sem_bucket = by_semester.setdefault(sub.semester, [])
            sem_bucket.append({
                'public_id': str(sub.public_id),
                'group_number': sub.activity_item.group.group_number,
                'code': sub.activity_item.code,
                'description': sub.description,
                'approved_points': sub.approved_points,
                'status': sub.status,
            })

        homologation = getattr(enrollment, 'homologation', None)
        min_total = enrollment.course.min_total_points
        total_pts = progress['total_approved_points']
        results.append({
            'enrollment_id': enrollment.id,
            'enrollment_status': enrollment.status,
            'course': enrollment.course.name,
            'course_code': enrollment.course.code,
            'progress_percentage': (
                min(total_pts / min_total * 100, Decimal('100.00'))
                if min_total > 0
                else Decimal('100.00')
            ),
            **progress,
            'semester_extract': [
                {'semester': sem, 'items': items}
                for sem, items in sorted(by_semester.items())
            ],
            'homologation': homologation,
        })
    return results


def list_candidates_for_actor(actor) -> list[dict]:
    if not actor.has_role('PROFESSOR', 'COURSE_COORD', 'SIAC_COORD'):
        raise DomainPermissionError('Sem permissão para listar candidatos à homologação.')

    qs = Enrollment.objects.exclude(status='CANCELED').select_related(
        'student', 'course', 'course__campus'
    ).prefetch_related('course__activity_groups')

    if actor.has_role('PROFESSOR') and not actor.has_role('SIAC_COORD'):
        qs = qs.filter(course__prac_professor=actor)
    elif actor.has_role('COURSE_COORD') and not actor.has_role('SIAC_COORD'):
        qs = qs.filter(course__coordinator=actor)

    candidates = []
    for enrollment in qs.order_by('course__name', 'student__full_name'):
        progress = _compute_enrollment_progress(enrollment)
        progress.pop('approved_qs', None)
        homologation = getattr(enrollment, 'homologation', None)
        candidates.append({
            'enrollment_id': enrollment.id,
            'enrollment_status': enrollment.status,
            'student_name': enrollment.student.full_name,
            'student_institutional_id': enrollment.student.institutional_id,
            'course_id': enrollment.course_id,
            'course_name': enrollment.course.name,
            'course_code': enrollment.course.code,
            'can_finalize': can_evaluate_course(actor, enrollment.course) and progress['eligible_for_homologation'],
            **progress,
            'homologation': homologation,
        })
    return candidates


def _build_homologation_pdf(enrollment: Enrollment, total: Decimal, groups: list[dict], approved_subs) -> bytes:
    buffer = BytesIO()
    document = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = [
        Paragraph('Relatório Final de Atividades Complementares — SIAC-UTFPR', styles['Title']),
        Spacer(1, 14),
        Paragraph(f'<b>Estudante:</b> {escape(enrollment.student.full_name)}', styles['Normal']),
        Paragraph(f'<b>RA / Identificação:</b> {escape(enrollment.student.institutional_id)}', styles['Normal']),
        Paragraph(f'<b>Curso:</b> {escape(enrollment.course.name)} ({escape(enrollment.course.code)})', styles['Normal']),
        Paragraph(f'<b>Campus:</b> {escape(enrollment.course.campus.name)}', styles['Normal']),
        Paragraph(f'<b>Pontuação total aprovada:</b> {total} pontos', styles['Normal']),
        Paragraph(f'<b>Mínimo exigido pelo curso:</b> {enrollment.course.min_total_points} pontos', styles['Normal']),
        Paragraph('<b>Conceito Final para Histórico Escolar:</b> APROVADO', styles['Normal']),
        Spacer(1, 14),
    ]

    group_rows = [['Grupo', 'Pontos aprovados', 'Mínimo exigido']]
    for g in groups:
        group_rows.append([
            escape(f"Grupo {g['group_number']} — {g['title']}"),
            str(g['approved_points']),
            str(g['required_min_points']),
        ])
    group_table = Table(group_rows, repeatRows=1)
    group_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#111111')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#FFCC00')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(group_table)
    story.append(Spacer(1, 14))

    story.append(Paragraph('Atividades Aprovadas Consolidadas', styles['Heading2']))
    story.append(Spacer(1, 6))
    sub_rows = [['Semestre', 'Grupo/Item', 'Descrição', 'Pontos']]
    for s in approved_subs:
        sub_rows.append([
            escape(s.semester),
            escape(f"G{s.activity_item.group.group_number} / {s.activity_item.code}"),
            escape(s.description[:70]),
            str(s.approved_points),
        ])
    sub_table = Table(sub_rows, repeatRows=1)
    sub_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F3F4F6')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('PADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(sub_table)
    document.build(story)
    return buffer.getvalue()


@transaction.atomic
def finalize_homologation(*, actor, enrollment_id: int, client_ip: str | None = None) -> Homologation:
    enrollment = (
        Enrollment.objects.select_for_update()
        .select_related('student', 'course', 'course__campus')
        .filter(pk=enrollment_id)
        .first()
    )
    if not enrollment:
        raise DomainValidationError({'detail': 'Matrícula não encontrada.'})

    if not can_evaluate_course(actor, enrollment.course):
        raise DomainPermissionError(
            'Apenas o Docente Responsável (PRAC) titular do curso pode homologar esta matrícula.'
        )
    if Homologation.objects.filter(enrollment=enrollment).exists():
        raise DomainConflictError('Esta matrícula já possui uma homologação registrada.')

    progress = _compute_enrollment_progress(enrollment)
    if progress['pending_submissions'] > 0 or progress['correction_submissions'] > 0:
        raise DomainValidationError({
            'detail': 'Não é possível homologar enquanto houver submissões pendentes ou em correção.'
        })
    if not progress['minimum_reached']:
        raise DomainValidationError({
            'detail': 'Os requisitos mínimos de pontuação total e por grupo ainda não foram atingidos.'
        })

    pdf_bytes = _build_homologation_pdf(
        enrollment,
        progress['total_approved_points'],
        progress['groups'],
        progress['approved_qs'],
    )
    pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
    file_path = default_storage.save(
        f"homologations/{enrollment.id}-{timezone.now():%Y%m%d%H%M%S}.pdf",
        ContentFile(pdf_bytes),
    )

    set_db_audit_context(actor.id, client_ip)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT app.fn_register_homologation(%s, %s, %s, %s)',
                [enrollment.id, actor.id, file_path, pdf_hash],
            )
            homologation_id = cursor.fetchone()[0]
    except DatabaseError as exc:
        default_storage.delete(file_path)
        raise_mapped_db_error(exc)
    except Exception:
        default_storage.delete(file_path)
        raise

    Notification.objects.create(
        recipient=enrollment.student,
        submission=None,
        title='Atividades Complementares Homologadas',
        message=(
            f'Parabéns! Sua conclusão das Atividades Complementares em {enrollment.course.name} '
            f'foi homologada com {progress["total_approved_points"]} pontos. '
            'Acesse Minha Pontuação para confirmar o Relatório Final e baixar o PDF.'
        ),
    )

    return Homologation.objects.select_related(
        'enrollment__course', 'enrollment__student', 'homologated_by'
    ).get(pk=homologation_id)


@transaction.atomic
def confirm_homologation_by_student(*, actor, public_id, client_ip: str | None = None) -> Homologation:
    homologation = (
        Homologation.objects.select_for_update()
        .select_related('enrollment__student', 'enrollment__course')
        .filter(public_id=public_id)
        .first()
    )
    if not homologation:
        raise DomainValidationError({'detail': 'Homologação não encontrada.'})
    if homologation.enrollment.student_id != actor.id:
        raise DomainPermissionError('Apenas o estudante titular pode confirmar o relatório.')
    if homologation.student_confirmed_at:
        return homologation

    set_db_audit_context(actor.id, client_ip)
    homologation.student_confirmed_at = timezone.now()
    homologation.save(update_fields=['student_confirmed_at'])
    return homologation
