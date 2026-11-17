from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Q, Sum
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import can_manage_course, user_has_role
from apps.audit.models import AuditLog
from apps.courses.models import Enrollment
from .models import Notification, Submission
from .serializers import (
    NotificationSerializer, PendingSubmissionSerializer,
    SubmissionCreateSerializer, SubmissionHistorySerializer,
)


class SubmissionListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        submissions = Submission.objects.filter(
            enrollment__student=request.user
        ).select_related(
            'activity_item', 'enrollment__course'
        ).order_by('-created_at')
        return Response(SubmissionHistorySerializer(
            submissions, many=True, context={'request': request}
        ).data)

    def post(self, request):
        serializer = SubmissionCreateSerializer(
            data=request.data, context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        submission = serializer.save()
        return Response(
            SubmissionHistorySerializer(
                submission, context={'request': request}
            ).data,
            status=status.HTTP_201_CREATED,
        )


class PendingSubmissionListView(ListAPIView):
    serializer_class = PendingSubmissionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = Submission.objects.filter(status='PENDING')
        if user_has_role(user, 'SIAC_COORDINATOR'):
            queryset = queryset.filter(enrollment__course__campus=user.campus)
        elif user_has_role(user, 'PROFESSOR'):
            queryset = queryset.filter(
                Q(enrollment__course__coordinator=user)
                | Q(enrollment__course__prac_professor=user)
            )
        else:
            return Submission.objects.none()
        return queryset.select_related(
            'enrollment__student', 'enrollment__course', 'activity_item'
        ).order_by('-created_at')


class SubmissionFileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, public_id):
        try:
            submission = Submission.objects.select_related(
                'enrollment__course'
            ).get(public_id=public_id)
        except Submission.DoesNotExist:
            raise Http404

        user = request.user
        is_owner = submission.enrollment.student_id == user.id
        is_reviewer = can_manage_course(user, submission.enrollment.course)
        if not (is_owner or is_reviewer):
            return Response(
                {'detail': 'Você não tem permissão para acessar este comprovante.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not default_storage.exists(submission.file_path):
            raise Http404
        file_handle = default_storage.open(submission.file_path, 'rb')
        response = FileResponse(
            file_handle,
            content_type=submission.mime_type or 'application/octet-stream',
        )
        response['Content-Disposition'] = (
            f'inline; filename="comprovante-{submission.public_id}.{submission.file_ext}"'
        )
        response['X-Content-Type-Options'] = 'nosniff'
        return response


class EvaluateSubmissionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        decision = request.data.get('decision')
        feedback = str(request.data.get('feedback', '')).strip()
        raw_quantity = request.data.get('validated_quantity')

        if decision not in ('APPROVED', 'REJECTED'):
            return Response(
                {'decision': 'Use APPROVED ou REJECTED.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if decision == 'REJECTED' and not feedback:
            return Response(
                {'feedback': 'Informe a justificativa da rejeição.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            try:
                submission = Submission.objects.select_for_update().select_related(
                    'enrollment__course', 'enrollment__student'
                ).get(public_id=public_id)
            except Submission.DoesNotExist:
                return Response(
                    {'detail': 'Submissão não encontrada.'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            # Serializa avaliações da mesma matrícula para respeitar o teto
            # semestral do item mesmo quando há várias submissões simultâneas.
            Enrollment.objects.select_for_update().get(
                pk=submission.enrollment_id
            )
            submission.refresh_from_db()
            user = request.user
            course = submission.enrollment.course
            if not can_manage_course(user, course):
                return Response(
                    {'detail': 'Você não tem permissão para avaliar esta atividade.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if submission.status != 'PENDING':
                return Response(
                    {'detail': 'Esta atividade já foi avaliada.'},
                    status=status.HTTP_409_CONFLICT,
                )

            if raw_quantity in (None, ''):
                validated_quantity = submission.declared_quantity
            else:
                try:
                    validated_quantity = int(raw_quantity)
                    if isinstance(raw_quantity, bool) or str(raw_quantity).strip() not in (
                        str(validated_quantity),
                    ):
                        raise ValueError
                except (TypeError, ValueError):
                    return Response(
                        {'validated_quantity': 'Informe um número inteiro.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            if not 0 <= validated_quantity <= submission.declared_quantity:
                return Response(
                    {'validated_quantity': 'Quantidade validada fora do intervalo permitido.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if decision == 'REJECTED':
                validated_quantity = 0
            elif validated_quantity < 1:
                return Response(
                    {'validated_quantity': 'Uma aprovação exige quantidade maior que zero.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            is_coordinator = user_has_role(user, 'SIAC_COORDINATOR')
            evaluator_role = (
                'SIAC_COORDINATOR' if is_coordinator else 'PROFESSOR'
            )
            previous_status = submission.status
            submission.evaluator = user
            submission.evaluator_role = evaluator_role
            submission.evaluator_feedback = feedback
            submission.validated_quantity = validated_quantity
            submission.status = decision
            submission.evaluated_at = timezone.now()

            if decision == 'APPROVED':
                points = (
                    submission.applied_points_per_unit * validated_quantity
                )
                already_approved = Submission.objects.filter(
                    enrollment=submission.enrollment,
                    activity_item=submission.activity_item,
                    semester=submission.semester,
                    status='APPROVED',
                ).exclude(pk=submission.pk).aggregate(total=Sum('approved_points'))['total'] or 0
                remaining_limit = max(
                    submission.applied_max_points_semester - already_approved,
                    0,
                )
                submission.calculated_points = points
                submission.approved_points = min(points, remaining_limit)
            else:
                submission.calculated_points = 0
                submission.approved_points = 0

            submission.was_adjusted = (
                validated_quantity != submission.declared_quantity
            )
            submission.row_version += 1
            submission.save()

            Notification.objects.create(
                recipient=submission.enrollment.student,
                submission=submission,
                title=(
                    'Atividade aprovada' if decision == 'APPROVED'
                    else 'Atividade rejeitada'
                ),
                message=(
                    feedback or 'Sua atividade foi avaliada.'
                ),
            )
            AuditLog.objects.create(
                entity_type='Submission',
                entity_id=submission.pk,
                action='EVALUATE',
                actor_id=user.pk,
                ip_address=self._client_ip(request),
                previous_status=previous_status,
                new_status=decision,
                after_snapshot={
                    'validated_quantity': submission.validated_quantity,
                    'approved_points': str(submission.approved_points),
                    'feedback': feedback,
                },
            )

        return Response({
            'message': 'Avaliação realizada com sucesso.',
            'public_id': str(submission.public_id),
            'status': submission.status,
            'validated_quantity': submission.validated_quantity,
            'approved_points': submission.approved_points,
            'evaluator': user.full_name,
            'feedback': submission.evaluator_feedback,
        })

    @staticmethod
    def _client_ip(request):
        forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        return forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR')


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
