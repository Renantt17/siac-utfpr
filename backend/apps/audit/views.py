from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import AuditLogSerializer
from .services import list_audit_logs


class AuditLogListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        entity_type = request.query_params.get('entity_type') or None
        raw_limit = request.query_params.get('limit', '100')
        limit = int(raw_limit) if raw_limit.isdigit() else 100
        logs = list_audit_logs(actor=request.user, entity_type=entity_type, limit=limit)
        return Response(AuditLogSerializer(logs, many=True).data)
