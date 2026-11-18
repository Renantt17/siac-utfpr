from rest_framework import generics, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Campus, User
from .serializers import CampusSerializer, RegisterSerializer, StudentListSerializer
from .permissions import user_has_role


class RegisterView(generics.CreateAPIView):
    queryset = Campus.objects.none()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class CampusListView(generics.ListAPIView):
    serializer_class = CampusSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        return Campus.objects.filter(is_active=True).order_by('name')


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def me(request):
    user = request.user
    return Response({
        'id': str(user.public_id),
        'email': user.email,
        'full_name': user.full_name,
        'institutional_id': user.institutional_id,
        'campus': user.campus.acronym,
        'campus_id': user.campus_id,
        'campus_name': user.campus.name,
        'roles': list(user.roles.values_list('role', flat=True)),
    })



class StudentListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not user_has_role(request.user, 'PROFESSOR', 'SIAC_COORDINATOR'):
            return Response(
                {'detail': 'Somente professores e coordenadores podem consultar estudantes.'},
                status=403,
            )
        students = User.objects.filter(
            campus=request.user.campus,
            is_active=True,
            roles__role='STUDENT',
        ).distinct().order_by('full_name')
        return Response(StudentListSerializer(students, many=True).data)
