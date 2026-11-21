from django.db import DatabaseError, IntegrityError
from rest_framework import status
from rest_framework.exceptions import APIException


class DomainConflictError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Conflito ao processar a operação.'
    default_code = 'conflict'


class DomainValidationError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'Dados inválidos para a regra de negócio.'
    default_code = 'validation_error'


class DomainPermissionError(APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = 'Você não tem permissão para realizar esta operação.'
    default_code = 'permission_denied'


def raise_mapped_db_error(exc: DatabaseError) -> None:
    """Converte exceções do PostgreSQL (triggers/constraints) em erros HTTP claros."""
    message = str(exc).split('\n')[0].strip()
    sqlstate = getattr(exc, 'sqlstate', None) or getattr(
        getattr(exc, '__cause__', None), 'sqlstate', None
    )

    if sqlstate == '40001' or 'Conflito de concorrência' in message:
        raise DomainConflictError(
            'Este registro foi alterado por outro usuário. Atualize os dados e tente novamente.'
        ) from exc

    if isinstance(exc, IntegrityError):
        if 'uq_submissions_active_file_hash' in message:
            raise DomainConflictError(
                'Este comprovante já foi enviado em outra submissão ativa nesta matrícula.'
            ) from exc
        if 'uq_enrollments_active_student_course' in message:
            raise DomainConflictError(
                'O estudante já possui uma matrícula ativa neste curso.'
            ) from exc
        if 'ex_suspensions_no_overlap' in message:
            raise DomainConflictError(
                'Já existe um período de trancamento sobreposto às datas informadas.'
            ) from exc
        if 'uq_homologations_enrollment' in message:
            raise DomainConflictError(
                'Esta matrícula já possui uma homologação registrada.'
            ) from exc
        if 'uq_groups_course_number' in message or 'uq_items_group_code' in message or 'uq_courses_campus_code' in message:
            raise DomainConflictError('Já existe um registro com este código ou número.') from exc

    raise DomainValidationError(message) from exc
