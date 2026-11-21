from django.http import Http404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.context import get_client_ip
from .models import Opportunity
from .serializers import OpportunitySerializer
from .services import create_opportunity, list_opportunities, update_opportunity


class OpportunityListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        include_expired = request.query_params.get('include_expired') == 'true'
        raw_group = request.query_params.get('group_number')
        group_number = int(raw_group) if raw_group and raw_group.isdigit() else None
        modality = request.query_params.get('modality') or None

        items = list_opportunities(
            user=request.user,
            include_expired=include_expired,
            group_number=group_number,
            modality=modality,
        )
        return Response(OpportunitySerializer(items, many=True).data)

    def post(self, request):
        if not request.user.has_role('SIAC_COORD'):
            return Response(
                {'detail': 'Apenas o Coordenador do SIAC-UTFPR pode cadastrar oportunidades.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = OpportunitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        opportunity = create_opportunity(
            actor=request.user,
            validated_data=serializer.validated_data,
            client_ip=get_client_ip(request),
        )
        return Response(OpportunitySerializer(opportunity).data, status=status.HTTP_201_CREATED)


class OpportunityDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, public_id):
        opportunity = Opportunity.objects.filter(public_id=public_id).first()
        if not opportunity:
            raise Http404
        serializer = OpportunitySerializer(opportunity, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = update_opportunity(
            actor=request.user,
            opportunity=opportunity,
            validated_data=serializer.validated_data,
            client_ip=get_client_ip(request),
        )
        return Response(OpportunitySerializer(updated).data)

    def delete(self, request, public_id):
        opportunity = Opportunity.objects.filter(public_id=public_id).first()
        if not opportunity:
            raise Http404
        updated = update_opportunity(
            actor=request.user,
            opportunity=opportunity,
            validated_data={'is_active': False},
            client_ip=get_client_ip(request),
        )
        return Response(OpportunitySerializer(updated).data)
