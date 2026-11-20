from django.conf import settings
from django.core.files.storage import default_storage
from django.http import FileResponse, Http404, HttpResponse
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.context import get_client_ip
from apps.accounts.permissions import can_manage_enrollments
from .models import Homologation
from .serializers import HomologationSerializer
from .services import (
    confirm_homologation_by_student,
    finalize_homologation,
    get_student_summary,
    list_candidates_for_actor,
)


class HomologationSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        summaries = get_student_summary(request.user)
        for item in summaries:
            if item['homologation'] is not None:
                item['homologation'] = HomologationSerializer(
                    item['homologation'], context={'request': request}
                ).data
        return Response(summaries)


class HomologationCandidatesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        candidates = list_candidates_for_actor(request.user)
        for item in candidates:
            if item['homologation'] is not None:
                item['homologation'] = HomologationSerializer(
                    item['homologation'], context={'request': request}
                ).data
        return Response(candidates)


class FinalizeHomologationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, enrollment_id):
        homologation = finalize_homologation(
            actor=request.user,
            enrollment_id=enrollment_id,
            client_ip=get_client_ip(request),
        )
        return Response(
            HomologationSerializer(homologation, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class ConfirmHomologationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        homologation = confirm_homologation_by_student(
            actor=request.user,
            public_id=public_id,
            client_ip=get_client_ip(request),
        )
        return Response(
            HomologationSerializer(homologation, context={'request': request}).data
        )


class HomologationReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, public_id):
        homologation = Homologation.objects.select_related(
            'enrollment__student', 'enrollment__course'
        ).filter(public_id=public_id).first()
        if not homologation:
            raise Http404

        enrollment = homologation.enrollment
        if (
            enrollment.student_id != request.user.id
            and not can_manage_enrollments(request.user, enrollment.course)
        ):
            return Response(
                {'detail': 'Você não tem permissão para acessar este relatório.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not default_storage.exists(homologation.report_pdf_path):
            raise Http404

        disposition = f'attachment; filename="homologacao-{homologation.public_id}.pdf"'
        if getattr(settings, 'USE_X_ACCEL_REDIRECT', False):
            response = HttpResponse()
            response['Content-Type'] = 'application/pdf'
            response['X-Accel-Redirect'] = f'/protected-media/{homologation.report_pdf_path}'
            response['Content-Disposition'] = disposition
            response['X-Content-Type-Options'] = 'nosniff'
            response['Cache-Control'] = 'private, no-store'
            return response

        response = FileResponse(
            default_storage.open(homologation.report_pdf_path, 'rb'),
            content_type='application/pdf',
        )
        response['Content-Disposition'] = disposition
        response['X-Content-Type-Options'] = 'nosniff'
        response['Cache-Control'] = 'private, no-store'
        return response
