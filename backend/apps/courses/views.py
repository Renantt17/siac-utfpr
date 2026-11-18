from django.db import IntegrityError, transaction
from django.db.models import Prefetch, Q
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import can_manage_course, user_has_role
from .models import ActivityGroup, ActivityItem, Course, Enrollment
from .serializers import (
    ActivityGroupSerializer, CourseSerializer,
    EnrollmentCreateSerializer, EnrollmentSerializer,
)


class CourseListView(generics.ListAPIView):
    serializer_class = CourseSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = Course.objects.filter(is_active=True).select_related('campus')
        if user_has_role(user, 'SIAC_COORDINATOR'):
            return queryset.filter(campus=user.campus)
        if user_has_role(user, 'PROFESSOR'):
            return queryset.filter(
                Q(coordinator=user) | Q(prac_professor=user)
            )
        return queryset.filter(campus=user.campus)


class MyEnrollmentsView(generics.ListAPIView):
    serializer_class = EnrollmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Enrollment.objects.filter(
            student=self.request.user,
            status='ACTIVE',
            course__is_active=True,
        ).select_related('course', 'course__campus').order_by('course__name')


class EnrollmentCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = EnrollmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        course = serializer.validated_data['course']
        if not can_manage_course(request.user, course):
            return Response(
                {'detail': 'Você não pode matricular estudantes neste curso.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            with transaction.atomic():
                enrollment, created = Enrollment.objects.get_or_create(
                    student=serializer.validated_data['student'],
                    course=course,
                    defaults={
                        'enrollment_date': serializer.validated_data['enrollment_date'],
                        'status': 'ACTIVE',
                    },
                )
        except IntegrityError:
            return Response(
                {'detail': 'Já existe uma matrícula para este estudante e curso.'},
                status=status.HTTP_409_CONFLICT,
            )
        if not created:
            return Response(
                {'detail': 'O estudante já possui matrícula neste curso.'},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(
            EnrollmentSerializer(enrollment).data,
            status=status.HTTP_201_CREATED,
        )


class ActivityCatalogView(generics.ListAPIView):
    serializer_class = ActivityGroupSerializer
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request, *args, **kwargs):
        course_id = request.query_params.get('course_id')
        if not course_id:
            return Response(
                {'course_id': 'Informe o curso para consultar o catálogo.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not course_id.isdigit():
            return Response(
                {'course_id': 'Informe um identificador numérico válido.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        course = Course.objects.filter(
            pk=course_id, is_active=True
        ).first()
        if not course:
            return Response(
                {'detail': 'Curso não encontrado ou inativo.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        is_enrolled = Enrollment.objects.filter(
            student=request.user,
            course=course,
            status='ACTIVE',
        ).exists()
        if not is_enrolled and not can_manage_course(request.user, course):
            return Response(
                {'detail': 'Você não possui matrícula ou permissão para consultar este curso.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        course_id = self.request.query_params.get('course_id')
        return ActivityGroup.objects.filter(
            course_id=course_id,
            is_active=True,
            activity_items__is_active=True,
        ).prefetch_related(Prefetch(
            'activity_items',
            queryset=ActivityItem.objects.filter(
                is_active=True, is_selectable=True
            ).order_by('code'),
        )).distinct().order_by('group_number')
