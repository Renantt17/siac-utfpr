from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user

    return Response({
        'id': user.public_id,
        'email': user.email,
        'full_name': user.full_name,
        'campus': user.campus.acronym,
        'roles': list(user.roles.values_list('role', flat=True)),
    })