from django.db import connection


def get_client_ip(request) -> str | None:
    """Obtém o IP remoto do cliente sem confiar em cabeçalhos não validados."""
    if not request:
        return None
    return request.META.get('REMOTE_ADDR')


def set_db_audit_context(user_id: int | None, client_ip: str | None = None) -> None:
    """Injeta contexto de auditoria na transação PostgreSQL para as triggers."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT set_config('app.current_user_id', %s, true)",
            [str(user_id) if user_id is not None else ''],
        )
        cursor.execute(
            "SELECT set_config('app.client_ip', %s, true)",
            [client_ip or ''],
        )
