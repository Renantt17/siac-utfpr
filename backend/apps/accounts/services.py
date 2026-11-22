from django.db import DatabaseError, connection, transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed

from .context import set_db_audit_context
from .db_errors import DomainPermissionError, DomainValidationError, raise_mapped_db_error
from .models import User


VALID_ROLES = {choice[0] for choice in User.Role.choices}


def authenticate_user_by_identifier(identifier: str, password: str) -> User:
    clean_identifier = (identifier or '').strip()
    if not clean_identifier or not password:
        raise AuthenticationFailed('Informe seu RA/e-mail e senha.')

    user = (
        User.objects.select_related('campus')
        .filter(
            Q(email__iexact=clean_identifier)
            | Q(institutional_id__iexact=clean_identifier)
        )
        .first()
    )
    if not user or not user.is_active or not user.check_password(password):
        raise AuthenticationFailed('Credenciais inválidas ou usuário inativo.')
    return user


def list_users_for_admin(*, role: str | None = None, campus_id: int | None = None, search: str | None = None):
    qs = User.objects.select_related('campus').order_by('full_name')
    if campus_id:
        qs = qs.filter(campus_id=campus_id)
    if search:
        qs = qs.filter(
            Q(full_name__icontains=search)
            | Q(email__icontains=search)
            | Q(institutional_id__icontains=search)
        )
    users = list(qs)
    if not users:
        return []

    roles_map = _fetch_roles_map([u.id for u in users])
    result = []
    for u in users:
        u_roles = roles_map.get(u.id, [])
        if role and role not in u_roles:
            continue
        result.append((u, u_roles))
    return result


def _fetch_roles_map(user_ids: list[int]) -> dict[int, list[str]]:
    if not user_ids:
        return {}
    with connection.cursor() as cursor:
        cursor.execute(
            'SELECT user_id, role FROM app.user_roles WHERE user_id = ANY(%s) ORDER BY granted_at, role',
            [user_ids],
        )
        mapping: dict[int, list[str]] = {}
        for uid, role_name in cursor.fetchall():
            mapping.setdefault(uid, []).append(role_name)
        return mapping


@transaction.atomic
def grant_role(*, actor: User, target_user: User, role: str, client_ip: str | None = None) -> list[str]:
    if not actor.has_role('SIAC_COORD'):
        raise DomainPermissionError('Apenas o Coordenador do SIAC pode gerenciar papéis.')
    if role not in VALID_ROLES:
        raise DomainValidationError({'role': 'Papel inválido.'})

    set_db_audit_context(actor.id, client_ip)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'INSERT INTO app.user_roles (user_id, role) VALUES (%s, %s) ON CONFLICT (user_id, role) DO NOTHING',
                [target_user.id, role],
            )
    except DatabaseError as exc:
        raise_mapped_db_error(exc)
    return target_user.get_roles()


@transaction.atomic
def revoke_role(*, actor: User, target_user: User, role: str, client_ip: str | None = None) -> list[str]:
    if not actor.has_role('SIAC_COORD'):
        raise DomainPermissionError('Apenas o Coordenador do SIAC pode gerenciar papéis.')
    if role not in VALID_ROLES:
        raise DomainValidationError({'role': 'Papel inválido.'})
    if role == target_user.primary_role:
        raise DomainValidationError(
            {'role': 'Não é permitido remover o papel principal (primary_role) do usuário.'}
        )

    set_db_audit_context(actor.id, client_ip)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'DELETE FROM app.user_roles WHERE user_id = %s AND role = %s',
                [target_user.id, role],
            )
    except DatabaseError as exc:
        raise_mapped_db_error(exc)
    return target_user.get_roles()


def list_students_for_actor(actor: User):
    if not actor.has_role('PROFESSOR', 'COURSE_COORD', 'SIAC_COORD'):
        raise DomainPermissionError('Somente professores e coordenadores podem consultar estudantes.')

    with connection.cursor() as cursor:
        if actor.has_role('SIAC_COORD'):
            cursor.execute(
                """
                SELECT u.id
                  FROM app.users u
                  JOIN app.user_roles r ON r.user_id = u.id
                 WHERE r.role = 'STUDENT' AND u.is_active = TRUE
                 ORDER BY u.full_name
                """
            )
        else:
            cursor.execute(
                """
                SELECT u.id
                  FROM app.users u
                  JOIN app.user_roles r ON r.user_id = u.id
                 WHERE r.role = 'STUDENT' AND u.is_active = TRUE AND u.campus_id = %s
                 ORDER BY u.full_name
                """,
                [actor.campus_id],
            )
        ids = [row[0] for row in cursor.fetchall()]

    if not ids:
        return []
    users_by_id = {u.id: u for u in User.objects.select_related('campus').filter(id__in=ids)}
    return [users_by_id[uid] for uid in ids if uid in users_by_id]
