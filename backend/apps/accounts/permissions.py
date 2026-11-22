from rest_framework.permissions import BasePermission


def user_has_role(user, *roles: str) -> bool:
    return bool(user and user.is_authenticated and user.has_role(*roles))


def can_manage_course_structure(user, course) -> bool:
    """Coordenador do SIAC ou Coordenação do próprio curso."""
    if not user or not user.is_authenticated:
        return False
    if user.has_role('SIAC_COORD'):
        return True
    return user.has_role('COURSE_COORD') and course.coordinator_id == user.id


def can_manage_enrollments(user, course) -> bool:
    """PRAC titular, Coordenação do curso ou Coordenador do SIAC."""
    if not user or not user.is_authenticated:
        return False
    if user.has_role('SIAC_COORD'):
        return True
    if user.has_role('COURSE_COORD') and course.coordinator_id == user.id:
        return True
    return user.has_role('PROFESSOR') and course.prac_professor_id == user.id


def can_evaluate_course(user, course) -> bool:
    """Somente o Docente Responsável (PRAC) titular do curso (regra do SGBD)."""
    if not user or not user.is_authenticated:
        return False
    return user.has_role('PROFESSOR') and course.prac_professor_id == user.id


def can_view_course_analytics(user, course) -> bool:
    return can_manage_enrollments(user, course)


class IsSiacCoordinator(BasePermission):
    def has_permission(self, request, view):
        return user_has_role(request.user, 'SIAC_COORD')
