from rest_framework import generics, permissions, status
from rest_framework.response import Response

from apps.accounts.permissions import user_has_role
from .models import Opportunity
from .serializers import OpportunitySerializer


class OpportunityListCreateView(generics.ListCreateAPIView):
    serializer_class = OpportunitySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Opportunity.objects.filter(
            is_active=True,
            campus=self.request.user.campus,
        ).select_related('campus').order_by('-created_at')

    def create(self, request, *args, **kwargs):
        if not user_has_role(request.user, 'SIAC_COORDINATOR', 'PROFESSOR'):
            return Response(
                {'detail': 'Somente professores e coordenadores podem cadastrar oportunidades.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        campus = serializer.validated_data['campus']
        if campus.id != request.user.campus_id:
            return Response(
                {'campus': 'Não é permitido cadastrar oportunidade em outro campus.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        role = request.user.roles.filter(
            role__in=('SIAC_COORDINATOR', 'PROFESSOR')
        ).order_by('role').first()
        opportunity = serializer.save(
            created_by=role,
            created_by_role=role.role,
        )
        return Response(
            self.get_serializer(opportunity).data,
            status=status.HTTP_201_CREATED,
        )
