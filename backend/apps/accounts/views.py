from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView

from .context import get_client_ip
from .models import Campus, User
from .permissions import IsSiacCoordinator
from .serializers import (
    AdminUserSerializer,
    CampusSerializer,
    HybridTokenObtainSerializer,
    StudentListSerializer,
    UserProfileSerializer,
)
from .services import (
    grant_role,
    list_students_for_actor,
    list_users_for_admin,
    revoke_role,
)


class HybridLoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = HybridTokenObtainSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class CampusListView(generics.ListAPIView):
    serializer_class = CampusSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        return Campus.objects.filter(is_active=True).order_by('name')


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def me(request):
    return Response(UserProfileSerializer(request.user).data)


class StudentListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        students = list_students_for_actor(request.user)
        return Response(StudentListSerializer(students, many=True).data)


class AdminUserListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSiacCoordinator]

    def get(self, request):
        role = request.query_params.get('role') or None
        campus_raw = request.query_params.get('campus_id')
        campus_id = int(campus_raw) if campus_raw and campus_raw.isdigit() else None
        search = request.query_params.get('q') or None

        rows = list_users_for_admin(role=role, campus_id=campus_id, search=search)
        payload = [
            {
                'id': u.id,
                'public_id': u.public_id,
                'institutional_id': u.institutional_id,
                'email': u.email,
                'full_name': u.full_name,
                'primary_role': u.primary_role,
                'campus_id': u.campus_id,
                'campus_name': u.campus.name,
                'campus_acronym': u.campus.acronym,
                'is_active': u.is_active,
                'roles': roles,
            }
            for u, roles in rows
        ]
        return Response(AdminUserSerializer(payload, many=True).data)


class UserRoleManageView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSiacCoordinator]

    def post(self, request, public_id):
        target = User.objects.filter(public_id=public_id).first()
        if not target:
            return Response({'detail': 'Usuário não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        role = request.data.get('role', '')
        roles = grant_role(
            actor=request.user,
            target_user=target,
            role=role,
            client_ip=get_client_ip(request),
        )
        return Response({'public_id': str(target.public_id), 'roles': roles})

    def delete(self, request, public_id):
        target = User.objects.filter(public_id=public_id).first()
        if not target:
            return Response({'detail': 'Usuário não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        role = request.data.get('role') or request.query_params.get('role') or ''
        roles = revoke_role(
            actor=request.user,
            target_user=target,
            role=role,
            client_ip=get_client_ip(request),
        )
        return Response({'public_id': str(target.public_id), 'roles': roles})
