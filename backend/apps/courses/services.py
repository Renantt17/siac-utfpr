from decimal import Decimal

from django.db import DatabaseError, transaction
from django.db.models import Count, Q, Sum

from apps.accounts.context import set_db_audit_context
from apps.accounts.db_errors import (
    DomainConflictError,
    DomainPermissionError,
    DomainValidationError,
    raise_mapped_db_error,
)
from apps.accounts.permissions import (
    can_manage_course_structure,
    can_manage_enrollments,
    can_view_course_analytics,
)
from apps.submissions.models import Submission
from .default_scoring_table import DEFAULT_MIN_TOTAL_POINTS, DEFAULT_SCORING_GROUPS
from .models import (
    ActivityGroup,
    ActivityItem,
    Course,
    Enrollment,
    EnrollmentSuspension,
)


def populate_default_scoring_table(course: Course) -> None:
    """Inicializa um curso com os 3 grupos e itens da Tabela Padrão da UTFPR."""
    for group_data in DEFAULT_SCORING_GROUPS:
        group = ActivityGroup.objects.create(
            course=course,
            group_number=group_data['group_number'],
            title=group_data['title'],
            min_points=group_data['min_points'],
            is_active=True,
        )
        for item_data in group_data['items']:
            children = item_data.get('children', [])
            parent = ActivityItem.objects.create(
                group=group,
                parent_item=None,
                code=item_data['code'],
                description=item_data['description'],
                points_per_unit=item_data['points_per_unit'],
                unit_name=item_data['unit_name'],
                max_points_semester=item_data['max_points_semester'],
                required_proof_description=item_data['required_proof_description'],
                is_selectable=item_data['is_selectable'],
                is_active=True,
            )
            for child in children:
                ActivityItem.objects.create(
                    group=group,
                    parent_item=parent,
                    code=child['code'],
                    description=child['description'],
                    points_per_unit=child['points_per_unit'],
                    unit_name=child['unit_name'],
                    max_points_semester=child['max_points_semester'],
                    required_proof_description=child['required_proof_description'],
                    is_selectable=True,
                    is_active=True,
                )


def list_courses_for_user(user):
    qs = Course.objects.filter(is_active=True).select_related(
        'campus', 'coordinator', 'prac_professor'
    ).order_by('name')
    if user.has_role('SIAC_COORD'):
        return qs
    filters = Q()
    if user.has_role('COURSE_COORD'):
        filters |= Q(coordinator=user)
    if user.has_role('PROFESSOR'):
        filters |= Q(prac_professor=user)
    if user.has_role('STUDENT'):
        filters |= Q(enrollments__student=user, enrollments__status='ACTIVE')
    if not filters:
        return Course.objects.none()
    return qs.filter(filters).distinct()


@transaction.atomic
def create_course(*, actor, validated_data: dict, client_ip: str | None = None) -> Course:
    if not actor.has_role('SIAC_COORD'):
        raise DomainPermissionError('Apenas o Coordenador do SIAC pode cadastrar cursos.')

    set_db_audit_context(actor.id, client_ip)
    try:
        course = Course.objects.create(
            campus=validated_data['campus'],
            name=validated_data['name'].strip(),
            code=validated_data['code'].strip().upper(),
            coordinator=validated_data['coordinator'],
            prac_professor=validated_data['prac_professor'],
            min_total_points=validated_data.get('min_total_points', DEFAULT_MIN_TOTAL_POINTS),
            is_active=True,
        )
        if validated_data.get('use_default_table', True):
            populate_default_scoring_table(course)
    except DatabaseError as exc:
        raise_mapped_db_error(exc)
    return course


@transaction.atomic
def update_course(*, actor, course: Course, validated_data: dict, client_ip: str | None = None) -> Course:
    if not can_manage_course_structure(actor, course):
        raise DomainPermissionError('Sem permissão para alterar este curso.')

    if not actor.has_role('SIAC_COORD') and any(
        k in validated_data for k in ('coordinator', 'prac_professor', 'campus', 'code')
    ):
        raise DomainPermissionError(
            'Apenas o Coordenador do SIAC pode alterar campus, código, coordenação ou PRAC.'
        )

    set_db_audit_context(actor.id, client_ip)
    for field in ('name', 'code', 'campus', 'coordinator', 'prac_professor', 'min_total_points', 'is_active'):
        if field in validated_data:
            setattr(course, field, validated_data[field])
    try:
        course.save()
    except DatabaseError as exc:
        raise_mapped_db_error(exc)
    return course


@transaction.atomic
def create_group(*, actor, course: Course, validated_data: dict, client_ip: str | None = None) -> ActivityGroup:
    if not can_manage_course_structure(actor, course):
        raise DomainPermissionError('Sem permissão para editar a tabela deste curso.')

    set_db_audit_context(actor.id, client_ip)
    try:
        return ActivityGroup.objects.create(course=course, **validated_data)
    except DatabaseError as exc:
        raise_mapped_db_error(exc)


@transaction.atomic
def update_group(*, actor, group: ActivityGroup, validated_data: dict, client_ip: str | None = None) -> ActivityGroup:
    if not can_manage_course_structure(actor, group.course):
        raise DomainPermissionError('Sem permissão para editar grupos deste curso.')

    set_db_audit_context(actor.id, client_ip)
    for field in ('group_number', 'title', 'min_points', 'is_active'):
        if field in validated_data:
            setattr(group, field, validated_data[field])
    try:
        group.save()
    except DatabaseError as exc:
        raise_mapped_db_error(exc)
    return group


@transaction.atomic
def delete_or_deactivate_group(*, actor, group: ActivityGroup, client_ip: str | None = None) -> str:
    if not can_manage_course_structure(actor, group.course):
        raise DomainPermissionError('Sem permissão para remover grupos deste curso.')

    set_db_audit_context(actor.id, client_ip)
    try:
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute('SELECT app.fn_delete_unused_activity_group(%s)', [group.id])
            return cursor.fetchone()[0]
    except DatabaseError as exc:
        raise_mapped_db_error(exc)


@transaction.atomic
def create_item(*, actor, group: ActivityGroup, validated_data: dict, client_ip: str | None = None) -> ActivityItem:
    if not can_manage_course_structure(actor, group.course):
        raise DomainPermissionError('Sem permissão para criar itens neste curso.')

    set_db_audit_context(actor.id, client_ip)
    try:
        return ActivityItem.objects.create(group=group, **validated_data)
    except DatabaseError as exc:
        raise_mapped_db_error(exc)


@transaction.atomic
def update_item(*, actor, item: ActivityItem, validated_data: dict, client_ip: str | None = None) -> ActivityItem:
    if not can_manage_course_structure(actor, item.group.course):
        raise DomainPermissionError('Sem permissão para editar itens deste curso.')

    set_db_audit_context(actor.id, client_ip)
    for field in (
        'code',
        'description',
        'points_per_unit',
        'unit_name',
        'max_points_semester',
        'required_proof_description',
        'is_active',
    ):
        if field in validated_data:
            setattr(item, field, validated_data[field])
    try:
        item.save()
    except DatabaseError as exc:
        raise_mapped_db_error(exc)
    return item


@transaction.atomic
def create_enrollment(
    *, actor, student, course: Course, enrollment_date, client_ip: str | None = None
) -> Enrollment:
    if not can_manage_enrollments(actor, course):
        raise DomainPermissionError('Você não tem permissão para matricular estudantes neste curso.')

    if Enrollment.objects.filter(student=student, course=course, status='ACTIVE').exists():
        raise DomainConflictError('O estudante já possui matrícula ativa neste curso.')

    set_db_audit_context(actor.id, client_ip)
    try:
        return Enrollment.objects.create(
            student=student,
            course=course,
            enrollment_date=enrollment_date,
            status='ACTIVE',
        )
    except DatabaseError as exc:
        raise_mapped_db_error(exc)


@transaction.atomic
def create_suspension(
    *, actor, enrollment: Enrollment, start_date, end_date, reason: str, client_ip: str | None = None
) -> EnrollmentSuspension:
    if not can_manage_enrollments(actor, enrollment.course):
        raise DomainPermissionError('Sem permissão para registrar trancamentos neste curso.')
    if end_date < start_date:
        raise DomainValidationError({'end_date': 'A data final deve ser igual ou posterior à inicial.'})

    set_db_audit_context(actor.id, client_ip)
    try:
        return EnrollmentSuspension.objects.create(
            enrollment=enrollment,
            start_date=start_date,
            end_date=end_date,
            reason=(reason or '').strip() or None,
        )
    except DatabaseError as exc:
        raise_mapped_db_error(exc)


def get_course_analytics(*, actor, course: Course) -> dict:
    if not can_view_course_analytics(actor, course):
        raise DomainPermissionError('Sem permissão para consultar indicadores deste curso.')

    submissions = Submission.objects.filter(enrollment__course=course)
    counts = dict(
        submissions.values_list('status').annotate(total=Count('id'))
    )
    active_groups = list(
        course.activity_groups.filter(is_active=True).order_by('group_number')
    )
    enrollments = (
        Enrollment.objects.filter(course=course)
        .exclude(status='CANCELED')
        .select_related('student')
        .prefetch_related('homologation')
        .order_by('student__full_name')
    )

    students_progress = []
    eligible_count = 0
    homologated_count = 0
    for enrollment in enrollments:
        approved = Submission.objects.filter(
            enrollment=enrollment,
            status__in=('APPROVED', 'APPROVED_WITH_ADJUSTMENTS'),
        )
        total_pts = approved.aggregate(s=Sum('approved_points'))['s'] or Decimal('0.00')
        groups_ok = True
        group_breakdown = []
        for g in active_groups:
            g_pts = (
                approved.filter(activity_item__group=g).aggregate(s=Sum('approved_points'))['s']
                or Decimal('0.00')
            )
            reached = g_pts >= g.min_points
            if not reached:
                groups_ok = False
            group_breakdown.append({
                'group_id': g.id,
                'group_number': g.group_number,
                'approved_points': g_pts,
                'required_min_points': g.min_points,
                'minimum_reached': reached,
            })

        pending_cnt = Submission.objects.filter(
            enrollment=enrollment, status__in=('PENDING', 'CORRECTION_REQUESTED')
        ).count()
        is_homologated = hasattr(enrollment, 'homologation')
        is_eligible = (
            enrollment.status == 'ACTIVE'
            and not is_homologated
            and pending_cnt == 0
            and bool(active_groups)
            and groups_ok
            and total_pts >= course.min_total_points
        )
        if is_homologated:
            homologated_count += 1
        elif is_eligible:
            eligible_count += 1

        students_progress.append({
            'enrollment_id': enrollment.id,
            'student_name': enrollment.student.full_name,
            'institutional_id': enrollment.student.institutional_id,
            'status': enrollment.status,
            'total_approved_points': total_pts,
            'required_min_total_points': course.min_total_points,
            'pending_submissions': pending_cnt,
            'eligible': is_eligible,
            'homologated': is_homologated,
            'groups': group_breakdown,
        })

    return {
        'course_id': course.id,
        'course_name': course.name,
        'course_code': course.code,
        'min_total_points': course.min_total_points,
        'submissions_summary': {
            'PENDING': counts.get('PENDING', 0),
            'CORRECTION_REQUESTED': counts.get('CORRECTION_REQUESTED', 0),
            'APPROVED': counts.get('APPROVED', 0),
            'APPROVED_WITH_ADJUSTMENTS': counts.get('APPROVED_WITH_ADJUSTMENTS', 0),
            'REJECTED': counts.get('REJECTED', 0),
            'CANCELED': counts.get('CANCELED', 0),
        },
        'students_count': len(students_progress),
        'eligible_count': eligible_count,
        'homologated_count': homologated_count,
        'students': students_progress,
    }
