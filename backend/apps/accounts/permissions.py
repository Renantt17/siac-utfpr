from rest_framework.permissions import BasePermission


def user_has_role(user, *roles):
    return user.is_authenticated and user.roles.filter(role__in=roles).exists()


def can_manage_course(user, course):
    if not user.is_authenticated:
        return False
    if user_has_role(user, 'SIAC_COORDINATOR'):
        return user.campus_id == course.campus_id
    return (
        user_has_role(user, 'PROFESSOR')
        and user.pk in (course.coordinator_id, course.prac_professor_id)
    )


class IsSiacCoordinator(BasePermission):
    def has_permission(self, request, view):
        return user_has_role(request.user, 'SIAC_COORDINATOR')
