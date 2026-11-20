import hashlib
from io import BytesIO
import uuid

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import DatabaseError, transaction
from django.db.models import F, Q, Sum
from django.utils import timezone
import filetype
from PIL import Image, ImageOps

from apps.accounts.context import set_db_audit_context
from apps.accounts.db_errors import (
    DomainConflictError,
    DomainPermissionError,
    DomainValidationError,
    raise_mapped_db_error,
)
from apps.accounts.permissions import can_evaluate_course, can_manage_enrollments
from apps.courses.models import ActivityItem, Enrollment, EnrollmentSuspension
from .models import Notification, Submission

MAX_UPLOAD_SIZE = 10 * 1024 * 1024
MAX_COMPRESSED_IMAGE_BYTES = 500 * 1024
MAX_IMAGE_DIMENSION = 1920

ALLOWED_MIME_TYPES = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
}


def derive_semester_from_date(activity_end_date) -> str:
    half = 1 if activity_end_date.month <= 6 else 2
    return f'{activity_end_date.year}.{half}'


def process_and_validate_proof(uploaded_file) -> dict:
    """Valida assinatura binária (magic bytes), calcula hash SHA-256 e comprime imagens."""
    if uploaded_file.size <= 0:
        raise DomainValidationError({'file': 'O arquivo enviado está vazio.'})
    if uploaded_file.size > MAX_UPLOAD_SIZE:
        raise DomainValidationError({'file': 'O arquivo deve ter no máximo 10 MB.'})

    raw_bytes = uploaded_file.read()
    detected = filetype.guess(raw_bytes[:261])
    if not detected or detected.mime not in ALLOWED_MIME_TYPES:
        raise DomainValidationError({'file': 'Formato não permitido. Envie PDF, JPG ou PNG.'})

    original_hash = hashlib.sha256(raw_bytes).hexdigest()
    mime_type = detected.mime
    ext = ALLOWED_MIME_TYPES[mime_type]

    if mime_type == 'application/pdf':
        return {
            'bytes': raw_bytes,
            'mime_type': mime_type,
            'ext': ext,
            'size': len(raw_bytes),
            'sha256': original_hash,
        }

    # Otimização de imagem mantendo legibilidade (< 500 KB)
    try:
        img = Image.open(BytesIO(raw_bytes))
        img = ImageOps.exif_transpose(img)
    except Exception as exc:
        raise DomainValidationError({'file': 'Não foi possível processar a imagem enviada.'}) from exc

    if max(img.size) > MAX_IMAGE_DIMENSION:
        img.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)

    out_bytes = raw_bytes
    if mime_type == 'image/png' and len(raw_bytes) > MAX_COMPRESSED_IMAGE_BYTES:
        buf = BytesIO()
        img.save(buf, format='PNG', optimize=True)
        out_bytes = buf.getvalue()
        if len(out_bytes) > MAX_COMPRESSED_IMAGE_BYTES:
            # Converte para JPEG caso o PNG permaneça acima de 500 KB
            mime_type = 'image/jpeg'
            ext = 'jpg'

    if mime_type == 'image/jpeg':
        if img.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if 'A' in img.mode else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        for quality in (85, 75, 65, 55, 45):
            buf = BytesIO()
            img.save(buf, format='JPEG', quality=quality, optimize=True)
            out_bytes = buf.getvalue()
            if len(out_bytes) <= MAX_COMPRESSED_IMAGE_BYTES:
                break

    return {
        'bytes': out_bytes,
        'mime_type': mime_type,
        'ext': ext,
        'size': len(out_bytes),
        'sha256': original_hash,
    }


def _get_cap_context(item: ActivityItem):
    cap_item = item.parent_item if item.parent_item_id else item
    cap_limit = cap_item.max_points_semester if cap_item else item.max_points_semester
    return cap_item.id, cap_limit


def _semester_approved_points(
    enrollment_id: int,
    cap_item_id: int,
    semester: str,
    exclude_submission_id: int | None = None,
):
    qs = Submission.objects.filter(
        enrollment_id=enrollment_id,
        semester=semester,
        status__in=('APPROVED', 'APPROVED_WITH_ADJUSTMENTS'),
    ).filter(
        Q(activity_item_id=cap_item_id) | Q(activity_item__parent_item_id=cap_item_id)
    )
    if exclude_submission_id is not None:
        qs = qs.exclude(pk=exclude_submission_id)
    return qs.aggregate(total=Sum('approved_points'))['total'] or 0


def _validate_enrollment_and_dates(enrollment: Enrollment, start_date, end_date) -> None:
    if enrollment.status != 'ACTIVE' or not enrollment.course.is_active:
        raise DomainValidationError({'enrollment': 'A matrícula ou o curso não está ativo.'})
    if end_date < start_date:
        raise DomainValidationError({'activity_end_date': 'A data final não pode ser anterior à data inicial.'})
    if start_date < enrollment.enrollment_date:
        raise DomainValidationError({
            'activity_start_date': (
                f'A atividade ({start_date:%d/%m/%Y}) é anterior à data de ingresso '
                f'no curso ({enrollment.enrollment_date:%d/%m/%Y}).'
            )
        })
    overlap = EnrollmentSuspension.objects.filter(
        enrollment=enrollment,
        start_date__lte=end_date,
        end_date__gte=start_date,
    ).exists()
    if overlap:
        raise DomainValidationError({
            'activity_start_date': 'O período da atividade coincide com um período de trancamento de matrícula.'
        })


@transaction.atomic
def create_submission(*, actor, validated_data: dict, client_ip: str | None = None) -> Submission:
    enrollment: Enrollment = validated_data['enrollment']
    item: ActivityItem = validated_data['activity_item']
    start_date = validated_data['activity_start_date']
    end_date = validated_data['activity_end_date']

    if enrollment.student_id != actor.id:
        raise DomainPermissionError('A matrícula não pertence ao usuário autenticado.')

    _validate_enrollment_and_dates(enrollment, start_date, end_date)

    if item.group.course_id != enrollment.course_id:
        raise DomainValidationError({'activity_item': 'A atividade não pertence ao curso da matrícula.'})
    if not item.is_active or not item.group.is_active or (item.parent_item_id and not item.parent_item.is_active):
        raise DomainValidationError({'activity_item': 'Esta atividade não está disponível.'})
    if not item.is_selectable:
        raise DomainValidationError({'activity_item': 'Este item é agrupador; selecione uma subcategoria específica.'})

    file_info = process_and_validate_proof(validated_data['file'])
    if Submission.objects.filter(
        enrollment=enrollment,
        file_hash_sha256=file_info['sha256'],
    ).exclude(status__in=('CANCELED', 'REJECTED')).exists():
        raise DomainConflictError(
            'Este comprovante já foi enviado em outra submissão ativa nesta matrícula.'
        )

    semester = derive_semester_from_date(end_date)
    _, max_sem = _get_cap_context(item)
    storage_path = default_storage.save(
        f"submissions/{enrollment.id}/{uuid.uuid4().hex}.{file_info['ext']}",
        ContentFile(file_info['bytes']),
    )

    set_db_audit_context(actor.id, client_ip)
    try:
        return Submission.objects.create(
            enrollment=enrollment,
            activity_item=item,
            description=validated_data['description'].strip(),
            activity_start_date=start_date,
            activity_end_date=end_date,
            semester=semester,
            declared_quantity=validated_data['declared_quantity'],
            original_activity_item=item,
            original_semester=semester,
            original_declared_quantity=validated_data['declared_quantity'],
            applied_points_per_unit=item.points_per_unit,
            applied_unit_name=item.unit_name,
            applied_max_points_semester=max_sem,
            file_path=storage_path,
            file_ext=file_info['ext'],
            mime_type=file_info['mime_type'],
            file_size_bytes=file_info['size'],
            file_hash_sha256=file_info['sha256'],
            status=Submission.Status.PENDING,
        )
    except DatabaseError as exc:
        default_storage.delete(storage_path)
        raise_mapped_db_error(exc)
    except Exception:
        default_storage.delete(storage_path)
        raise


@transaction.atomic
def update_submission_by_student(
    *, actor, public_id, validated_data: dict, resubmit: bool = False, client_ip: str | None = None
) -> Submission:
    submission = (
        Submission.objects.select_for_update()
        .select_related('enrollment__course', 'activity_item__group')
        .filter(public_id=public_id)
        .first()
    )
    if not submission:
        raise DomainValidationError({'detail': 'Submissão não encontrada.'})
    if submission.enrollment.student_id != actor.id:
        raise DomainPermissionError('Você não tem permissão para alterar esta submissão.')

    expected_status = Submission.Status.CORRECTION_REQUESTED if resubmit else Submission.Status.PENDING
    if submission.status != expected_status:
        raise DomainConflictError(
            f'Ação não permitida no status atual ({submission.status}).'
        )

    expected_version = validated_data.get('row_version')
    if expected_version is not None and int(expected_version) != submission.row_version:
        raise DomainConflictError('Submissão desatualizada. Recarregue a página e tente novamente.')

    item = validated_data.get('activity_item', submission.activity_item)
    start_date = validated_data.get('activity_start_date', submission.activity_start_date)
    end_date = validated_data.get('activity_end_date', submission.activity_end_date)
    quantity = validated_data.get('declared_quantity', submission.declared_quantity)
    description = validated_data.get('description', submission.description).strip()

    _validate_enrollment_and_dates(submission.enrollment, start_date, end_date)
    if item.group.course_id != submission.enrollment.course_id:
        raise DomainValidationError({'activity_item': 'A atividade não pertence ao curso da matrícula.'})
    if not item.is_active or not item.group.is_active or not item.is_selectable:
        raise DomainValidationError({'activity_item': 'Atividade inválida ou inativa.'})

    old_path = None
    new_path = None
    uploaded = validated_data.get('file')
    if uploaded is not None:
        file_info = process_and_validate_proof(uploaded)
        if Submission.objects.filter(
            enrollment=submission.enrollment,
            file_hash_sha256=file_info['sha256'],
        ).exclude(pk=submission.pk).exclude(status__in=('CANCELED', 'REJECTED')).exists():
            raise DomainConflictError(
                'Este comprovante já foi enviado em outra submissão ativa nesta matrícula.'
            )
        old_path = submission.file_path
        new_path = default_storage.save(
            f"submissions/{submission.enrollment_id}/{uuid.uuid4().hex}.{file_info['ext']}",
            ContentFile(file_info['bytes']),
        )
        submission.file_path = new_path
        submission.file_ext = file_info['ext']
        submission.mime_type = file_info['mime_type']
        submission.file_size_bytes = file_info['size']
        submission.file_hash_sha256 = file_info['sha256']

    semester = derive_semester_from_date(end_date)
    _, max_sem = _get_cap_context(item)

    submission.activity_item = item
    submission.description = description
    submission.activity_start_date = start_date
    submission.activity_end_date = end_date
    submission.semester = semester
    submission.declared_quantity = quantity
    submission.original_activity_item = item
    submission.original_semester = semester
    submission.original_declared_quantity = quantity
    submission.applied_points_per_unit = item.points_per_unit
    submission.applied_unit_name = item.unit_name
    submission.applied_max_points_semester = max_sem
    submission.status = Submission.Status.PENDING
    submission.row_version = F('row_version') + 1

    set_db_audit_context(actor.id, client_ip)
    try:
        submission.save()
        submission.refresh_from_db()
    except DatabaseError as exc:
        if new_path:
            default_storage.delete(new_path)
        raise_mapped_db_error(exc)
    except Exception:
        if new_path:
            default_storage.delete(new_path)
        raise

    if old_path and old_path != submission.file_path:
        default_storage.delete(old_path)
    return submission


@transaction.atomic
def cancel_submission(*, actor, public_id, client_ip: str | None = None) -> Submission:
    submission = (
        Submission.objects.select_for_update()
        .select_related('enrollment')
        .filter(public_id=public_id)
        .first()
    )
    if not submission:
        raise DomainValidationError({'detail': 'Submissão não encontrada.'})
    if submission.enrollment.student_id != actor.id:
        raise DomainPermissionError('Você não tem permissão para cancelar esta submissão.')
    if submission.status not in (
        Submission.Status.PENDING,
        Submission.Status.CORRECTION_REQUESTED,
    ):
        raise DomainConflictError('Apenas submissões pendentes ou aguardando correção podem ser canceladas.')

    submission.status = Submission.Status.CANCELED
    submission.row_version = F('row_version') + 1

    set_db_audit_context(actor.id, client_ip)
    try:
        submission.save()
        submission.refresh_from_db()
    except DatabaseError as exc:
        raise_mapped_db_error(exc)
    return submission


@transaction.atomic
def evaluate_submission(*, actor, public_id, payload: dict, client_ip: str | None = None) -> Submission:
    submission = (
        Submission.objects.select_for_update()
        .select_related(
            'enrollment__course',
            'enrollment__student',
            'activity_item__group',
        )
        .filter(public_id=public_id)
        .first()
    )
    if not submission:
        raise DomainValidationError({'detail': 'Submissão não encontrada.'})

    Enrollment.objects.select_for_update().get(pk=submission.enrollment_id)
    submission.refresh_from_db()

    if not can_evaluate_course(actor, submission.enrollment.course):
        raise DomainPermissionError(
            'Apenas o Docente Responsável (PRAC) titular do curso pode avaliar esta atividade.'
        )

    if submission.enrollment.status != 'ACTIVE':
        raise DomainConflictError('Matrículas concluídas ou canceladas não permitem avaliações.')

    if submission.status == Submission.Status.CANCELED:
        raise DomainConflictError('Submissões canceladas não podem ser avaliadas.')

    expected_version = payload.get('row_version')
    if expected_version is not None and int(expected_version) != submission.row_version:
        raise DomainConflictError('Submissão alterada por outra operação. Atualize a fila.')

    decision = payload.get('decision')
    if decision not in (
        Submission.Status.APPROVED,
        Submission.Status.APPROVED_WITH_ADJUSTMENTS,
        Submission.Status.CORRECTION_REQUESTED,
        Submission.Status.REJECTED,
    ):
        raise DomainValidationError({
            'decision': 'Use APPROVED, APPROVED_WITH_ADJUSTMENTS, CORRECTION_REQUESTED ou REJECTED.'
        })

    feedback = (payload.get('feedback') or '').strip()
    if len(feedback) > 2000:
        raise DomainValidationError({'feedback': 'O parecer deve ter no máximo 2000 caracteres.'})

    is_revision = submission.status in (
        Submission.Status.APPROVED,
        Submission.Status.APPROVED_WITH_ADJUSTMENTS,
        Submission.Status.CORRECTION_REQUESTED,
        Submission.Status.REJECTED,
    )
    if is_revision and (not feedback or feedback == (submission.evaluator_feedback or '').strip()):
        raise DomainValidationError({
            'feedback': 'A revisão de parecer (RN007) exige uma nova justificativa detalhada.'
        })

    if decision in (
        Submission.Status.APPROVED_WITH_ADJUSTMENTS,
        Submission.Status.CORRECTION_REQUESTED,
        Submission.Status.REJECTED,
    ) and not feedback:
        raise DomainValidationError({'feedback': 'Informe o parecer/justificativa para esta decisão.'})

    submission.evaluator = actor
    submission.evaluator_feedback = feedback or None
    submission.evaluated_at = timezone.now()

    if decision == Submission.Status.APPROVED:
        if submission.activity_item_id != submission.original_activity_item_id:
            submission.activity_item = submission.original_activity_item
        submission.semester = submission.original_semester
        submission.validated_quantity = submission.declared_quantity

        cap_item_id, max_sem = _get_cap_context(submission.activity_item)
        raw_points = round(submission.declared_quantity * submission.applied_points_per_unit, 2)
        if max_sem is not None:
            already = _semester_approved_points(
                submission.enrollment_id, cap_item_id, submission.semester, exclude_submission_id=submission.pk
            )
            remaining = max(max_sem - already, 0)
            approved_pts = min(raw_points, remaining)
        else:
            approved_pts = raw_points

        if approved_pts <= 0:
            raise DomainValidationError({
                'detail': f'O teto semestral ({max_sem}) já foi integralmente atingido em {submission.semester}.'
            })
        submission.approved_points = approved_pts
        submission.was_adjusted = False
        submission.status = Submission.Status.APPROVED

    elif decision == Submission.Status.APPROVED_WITH_ADJUSTMENTS:
        target_item = submission.activity_item
        if payload.get('adjusted_activity_item'):
            target_item = ActivityItem.objects.select_related('group', 'parent_item').filter(
                pk=payload['adjusted_activity_item'],
                group__course_id=submission.enrollment.course_id,
                is_active=True,
                is_selectable=True,
            ).first()
            if not target_item:
                raise DomainValidationError({'adjusted_activity_item': 'Item de atividade inválido para este curso.'})

        target_semester = (payload.get('adjusted_semester') or submission.semester).strip()
        from decimal import Decimal, InvalidOperation
        raw_qty = payload.get('validated_quantity', submission.declared_quantity)
        try:
            qty_dec = Decimal(str(raw_qty))
        except (InvalidOperation, TypeError, ValueError):
            raise DomainValidationError({'validated_quantity': 'Informe uma quantidade válida.'})
        if qty_dec <= 0:
            raise DomainValidationError({'validated_quantity': 'A quantidade validada deve ser maior que zero.'})

        cap_item_id, max_sem = _get_cap_context(target_item)
        points_per_unit = target_item.points_per_unit
        raw_points = round(qty_dec * points_per_unit, 2)
        if max_sem is not None:
            already = _semester_approved_points(
                submission.enrollment_id, cap_item_id, target_semester, exclude_submission_id=submission.pk
            )
            remaining = max(max_sem - already, 0)
            approved_pts = min(raw_points, remaining)
        else:
            approved_pts = raw_points

        if approved_pts <= 0:
            raise DomainValidationError({
                'detail': f'O teto semestral ({max_sem}) já foi integralmente atingido em {target_semester}.'
            })

        submission.activity_item = target_item
        submission.semester = target_semester
        submission.validated_quantity = qty_dec
        submission.approved_points = approved_pts
        submission.was_adjusted = True
        submission.status = Submission.Status.APPROVED_WITH_ADJUSTMENTS

    elif decision == Submission.Status.CORRECTION_REQUESTED:
        submission.validated_quantity = None
        submission.approved_points = None
        submission.was_adjusted = False
        submission.status = Submission.Status.CORRECTION_REQUESTED

    elif decision == Submission.Status.REJECTED:
        submission.validated_quantity = None
        submission.approved_points = None
        submission.was_adjusted = False
        submission.status = Submission.Status.REJECTED

    submission.row_version = F('row_version') + 1
    set_db_audit_context(actor.id, client_ip)
    try:
        submission.save()
        submission.refresh_from_db()
    except DatabaseError as exc:
        raise_mapped_db_error(exc)

    titles = {
        Submission.Status.APPROVED: 'Atividade aprovada',
        Submission.Status.APPROVED_WITH_ADJUSTMENTS: 'Atividade aprovada com ajustes',
        Submission.Status.CORRECTION_REQUESTED: 'Correção solicitada pelo docente',
        Submission.Status.REJECTED: 'Atividade indeferida',
    }
    Notification.objects.create(
        recipient=submission.enrollment.student,
        submission=submission,
        title=titles[submission.status],
        message=submission.evaluator_feedback or f'Sua atividade "{submission.description}" foi avaliada.',
    )
    return submission
