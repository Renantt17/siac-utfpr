from django.conf import settings
from django.core.files.storage import default_storage
from django.http import FileResponse, Http404, HttpResponse
from rest_framework import permissions, status
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.context import get_client_ip
from apps.accounts.permissions import can_evaluate_course, can_manage_enrollments, user_has_role
from .models import Notification, Submission
from .serializers import (
    NotificationSerializer,
    SubmissionCreateSerializer,
    SubmissionDetailSerializer,
    SubmissionUpdateSerializer,
)
from .services import (
    cancel_submission,
    create_submission,
    evaluate_submission,
    update_submission_by_student,
)


class SubmissionListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = Submission.objects.filter(
            enrollment__student=request.user
        ).select_related(
            'activity_item__group',
            'original_activity_item',
            'enrollment__course',
            'enrollment__student',
            'evaluator',
        ).order_by('-created_at')

        status_filter = request.query_params.get('status')
        group_id = request.query_params.get('group_id')
        semester = request.query_params.get('semester')
        enrollment_id = request.query_params.get('enrollment_id')

        if status_filter:
            qs = qs.filter(status=status_filter)
        if group_id and group_id.isdigit():
            qs = qs.filter(activity_item__group_id=int(group_id))
        if semester:
            qs = qs.filter(semester=semester.strip())
        if enrollment_id and enrollment_id.isdigit():
            qs = qs.filter(enrollment_id=int(enrollment_id))

        return Response(
            SubmissionDetailSerializer(qs, many=True, context={'request': request}).data
        )

    def post(self, request):
        serializer = SubmissionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        submission = create_submission(
            actor=request.user,
            validated_data=serializer.validated_data,
            client_ip=get_client_ip(request),
        )
        return Response(
            SubmissionDetailSerializer(submission, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class SubmissionDetailManageView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, public_id):
        submission = Submission.objects.select_related(
            'activity_item__group',
            'original_activity_item',
            'enrollment__course',
            'enrollment__student',
            'evaluator',
        ).filter(public_id=public_id).first()
        if not submission:
            raise Http404
        is_owner = submission.enrollment.student_id == request.user.id
        if not is_owner and not can_manage_enrollments(request.user, submission.enrollment.course):
            return Response({'detail': 'Sem permissão para consultar esta submissão.'}, status=403)
        return Response(SubmissionDetailSerializer(submission, context={'request': request}).data)

    def patch(self, request, public_id):
        serializer = SubmissionUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        submission = update_submission_by_student(
            actor=request.user,
            public_id=public_id,
            validated_data=serializer.validated_data,
            resubmit=False,
            client_ip=get_client_ip(request),
        )
        return Response(SubmissionDetailSerializer(submission, context={'request': request}).data)

    def delete(self, request, public_id):
        submission = cancel_submission(
            actor=request.user,
            public_id=public_id,
            client_ip=get_client_ip(request),
        )
        return Response(SubmissionDetailSerializer(submission, context={'request': request}).data)


class SubmissionResubmitView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def put(self, request, public_id):
        serializer = SubmissionUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        submission = update_submission_by_student(
            actor=request.user,
            public_id=public_id,
            validated_data=serializer.validated_data,
            resubmit=True,
            client_ip=get_client_ip(request),
        )
        return Response(SubmissionDetailSerializer(submission, context={'request': request}).data)


class PendingSubmissionListView(ListAPIView):
    serializer_class = SubmissionDetailSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user_has_role(user, 'PROFESSOR', 'COURSE_COORD', 'SIAC_COORD'):
            return Submission.objects.none()

        status_filter = self.request.query_params.get('status') or Submission.Status.PENDING
        qs = Submission.objects.filter(status=status_filter)
        if user_has_role(user, 'PROFESSOR'):
            qs = qs.filter(enrollment__course__prac_professor=user)
        elif user_has_role(user, 'COURSE_COORD'):
            qs = qs.filter(enrollment__course__coordinator=user)

        return qs.select_related(
            'activity_item__group',
            'original_activity_item',
            'enrollment__course',
            'enrollment__student',
            'evaluator',
        ).order_by('created_at')


class EvaluateSubmissionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        submission = evaluate_submission(
            actor=request.user,
            public_id=public_id,
            payload=request.data,
            client_ip=get_client_ip(request),
        )
        return Response(SubmissionDetailSerializer(submission, context={'request': request}).data)


class SubmissionFileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, public_id):
        submission = Submission.objects.select_related('enrollment__course').filter(
            public_id=public_id
        ).first()
        if not submission:
            raise Http404

        user = request.user
        is_owner = submission.enrollment.student_id == user.id
        is_reviewer = can_manage_enrollments(user, submission.enrollment.course) or can_evaluate_course(
            user, submission.enrollment.course
        )
        if not (is_owner or is_reviewer):
            return Response(
                {'detail': 'Você não tem permissão para acessar este comprovante.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not default_storage.exists(submission.file_path):
            raise Http404

        disposition = f'attachment; filename="comprovante-{submission.public_id}.{submission.file_ext}"'
        if getattr(settings, 'USE_X_ACCEL_REDIRECT', False):
            response = HttpResponse()
            response['Content-Type'] = submission.mime_type or 'application/octet-stream'
            response['X-Accel-Redirect'] = f'/protected-media/{submission.file_path}'
            response['Content-Disposition'] = disposition
            response['X-Content-Type-Options'] = 'nosniff'
            response['Cache-Control'] = 'private, no-store'
            return response

        file_handle = default_storage.open(submission.file_path, 'rb')
        response = FileResponse(
            file_handle,
            content_type=submission.mime_type or 'application/octet-stream',
        )
        response['Content-Disposition'] = disposition
        response['X-Content-Type-Options'] = 'nosniff'
        response['Cache-Control'] = 'private, no-store'
        return response


class NotificationListView(ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(
            recipient=self.request.user
        ).select_related('submission').order_by('-created_at')


class NotificationReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, public_id):
        updated = Notification.objects.filter(
            public_id=public_id,
            recipient=request.user,
        ).update(is_read=True)
        if not updated:
            return Response(
                {'detail': 'Notificação não encontrada.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({'message': 'Notificação marcada como lida.'})
