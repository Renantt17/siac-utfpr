from django.db import DatabaseError, transaction
from django.db.models import Case, IntegerField, Value, When
from django.utils import timezone

from apps.accounts.context import set_db_audit_context
from apps.accounts.db_errors import DomainPermissionError, raise_mapped_db_error
from .models import Opportunity


def list_opportunities(
    *,
    user,
    include_expired: bool = False,
    group_number: int | None = None,
    modality: str | None = None,
):
    qs = Opportunity.objects.select_related('campus', 'created_by')
    if not (include_expired and user.has_role('SIAC_COORD')):
        today = timezone.localdate()
        qs = qs.filter(is_active=True, end_date__gte=today)

    if group_number is not None:
        qs = qs.filter(suggested_group_number=group_number)
    if modality:
        qs = qs.filter(modality=modality)

    # Prioriza oportunidades do campus do usuário, depois eventos globais (campus=NULL), depois outros campi
    qs = qs.annotate(
        campus_priority=Case(
            When(campus_id=user.campus_id, then=Value(0)),
            When(campus__isnull=True, then=Value(1)),
            default=Value(2),
            output_field=IntegerField(),
        )
    ).order_by('campus_priority', 'start_date', '-created_at')
    return qs


@transaction.atomic
def create_opportunity(*, actor, validated_data: dict, client_ip: str | None = None) -> Opportunity:
    if not actor.has_role('SIAC_COORD'):
        raise DomainPermissionError('Apenas o Coordenador do SIAC-UTFPR pode cadastrar oportunidades.')

    set_db_audit_context(actor.id, client_ip)
    try:
        return Opportunity.objects.create(**validated_data, created_by=actor, is_active=True)
    except DatabaseError as exc:
        raise_mapped_db_error(exc)


@transaction.atomic
def update_opportunity(
    *, actor, opportunity: Opportunity, validated_data: dict, client_ip: str | None = None
) -> Opportunity:
    if not actor.has_role('SIAC_COORD'):
        raise DomainPermissionError('Apenas o Coordenador do SIAC-UTFPR pode editar oportunidades.')

    set_db_audit_context(actor.id, client_ip)
    for field, value in validated_data.items():
        setattr(opportunity, field, value)
    try:
        opportunity.save()
    except DatabaseError as exc:
        raise_mapped_db_error(exc)
    return opportunity
