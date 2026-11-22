from django.db.models import Q

from apps.accounts.db_errors import DomainPermissionError
from apps.courses.models import Course, Enrollment
from apps.homologation.models import Homologation
from apps.submissions.models import Submission
from .models import AuditLog


def list_audit_logs(*, actor, entity_type: str | None = None, limit: int = 100):
    if not actor.has_role('SIAC_COORD', 'COURSE_COORD'):
        raise DomainPermissionError('Apenas a coordenação pode consultar logs de auditoria.')

    qs = AuditLog.objects.select_related('actor').order_by('-created_at', '-id')
    if entity_type:
        qs = qs.filter(entity_type=entity_type)

    if not actor.has_role('SIAC_COORD'):
        coord_courses = list(
            Course.objects.filter(coordinator=actor).values_list('id', flat=True)
        )
        if not coord_courses:
            return AuditLog.objects.none()
        enroll_ids = list(
            Enrollment.objects.filter(course_id__in=coord_courses).values_list('id', flat=True)
        )
        sub_ids = list(
            Submission.objects.filter(enrollment_id__in=enroll_ids).values_list('id', flat=True)
        )
        hom_ids = list(
            Homologation.objects.filter(enrollment_id__in=enroll_ids).values_list('id', flat=True)
        )
        qs = qs.filter(
            Q(entity_type='COURSE', entity_id__in=coord_courses)
            | Q(entity_type='ENROLLMENT', entity_id__in=enroll_ids)
            | Q(entity_type='SUBMISSION', entity_id__in=sub_ids)
            | Q(entity_type='HOMOLOGATION', entity_id__in=hom_ids)
        )

    safe_limit = min(max(limit, 1), 300)
    return qs[:safe_limit]
