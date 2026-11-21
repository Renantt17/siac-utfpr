from django.db.models import Prefetch
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.context import get_client_ip
from apps.accounts.permissions import can_manage_course_structure, can_manage_enrollments
from .models import (
    ActivityGroup,
    ActivityItem,
    Course,
    Enrollment,
    EnrollmentSuspension,
)
from .serializers import (
    ActivityGroupSerializer,
    ActivityGroupWriteSerializer,
    ActivityItemSerializer,
    ActivityItemWriteSerializer,
    CourseCreateSerializer,
    CourseSerializer,
    CourseUpdateSerializer,
    EnrollmentCreateSerializer,
    EnrollmentSerializer,
    EnrollmentSuspensionSerializer,
)
from .services import (
    create_course,
    create_enrollment,
    create_group,
    create_item,
    create_suspension,
    delete_or_deactivate_group,
    get_course_analytics,
    list_courses_for_user,
    update_course,
    update_group,
    update_item,
)


class CourseListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        courses = list_courses_for_user(request.user)
        return Response(CourseSerializer(courses, many=True).data)

    def post(self, request):
        serializer = CourseCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        course = create_course(
            actor=request.user,
            validated_data=serializer.validated_data,
            client_ip=get_client_ip(request),
        )
        return Response(CourseSerializer(course).data, status=status.HTTP_201_CREATED)


class CourseDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, course_id):
        course = Course.objects.filter(pk=course_id).first()
        if not course:
            return Response({'detail': 'Curso não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = CourseUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = update_course(
            actor=request.user,
            course=course,
            validated_data=serializer.validated_data,
            client_ip=get_client_ip(request),
        )
        return Response(CourseSerializer(updated).data)


class CourseScoringTableView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, course_id=None):
        cid = course_id or request.query_params.get('course_id')
        if not cid or not str(cid).isdigit():
            return Response(
                {'course_id': 'Informe um identificador numérico de curso válido.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        course = Course.objects.filter(pk=cid, is_active=True).first()
        if not course:
            return Response({'detail': 'Curso não encontrado ou inativo.'}, status=status.HTTP_404_NOT_FOUND)

        is_enrolled = Enrollment.objects.filter(
            student=request.user, course=course, status='ACTIVE'
        ).exists()
        is_manager = can_manage_enrollments(request.user, course)
        if not is_enrolled and not is_manager:
            return Response(
                {'detail': 'Você não possui matrícula ou permissão para consultar este curso.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        include_inactive = (
            request.query_params.get('include_inactive') == 'true'
            and can_manage_course_structure(request.user, course)
        )
        group_qs = ActivityGroup.objects.filter(course=course).order_by('group_number')
        item_qs = ActivityItem.objects.select_related('parent_item').order_by('code')
        if not include_inactive:
            group_qs = group_qs.filter(is_active=True)
            item_qs = item_qs.filter(is_active=True)

        groups = group_qs.prefetch_related(Prefetch('activity_items', queryset=item_qs))
        return Response(ActivityGroupSerializer(groups, many=True).data)


class CourseGroupListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, course_id):
        course = Course.objects.filter(pk=course_id).first()
        if not course:
            return Response({'detail': 'Curso não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ActivityGroupWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        for req_field in ('group_number', 'title'):
            if req_field not in serializer.validated_data:
                return Response({req_field: 'Campo obrigatório.'}, status=status.HTTP_400_BAD_REQUEST)
        group = create_group(
            actor=request.user,
            course=course,
            validated_data=serializer.validated_data,
            client_ip=get_client_ip(request),
        )
        return Response(ActivityGroupSerializer(group).data, status=status.HTTP_201_CREATED)


class CourseGroupDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, course_id, group_id):
        group = ActivityGroup.objects.select_related('course').filter(
            pk=group_id, course_id=course_id
        ).first()
        if not group:
            return Response({'detail': 'Grupo não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ActivityGroupWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = update_group(
            actor=request.user,
            group=group,
            validated_data=serializer.validated_data,
            client_ip=get_client_ip(request),
        )
        return Response(ActivityGroupSerializer(updated).data)

    def delete(self, request, course_id, group_id):
        group = ActivityGroup.objects.select_related('course').filter(
            pk=group_id, course_id=course_id
        ).first()
        if not group:
            return Response({'detail': 'Grupo não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        outcome = delete_or_deactivate_group(
            actor=request.user, group=group, client_ip=get_client_ip(request)
        )
        return Response({'outcome': outcome})


class CourseItemCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, course_id, group_id):
        group = ActivityGroup.objects.select_related('course').filter(
            pk=group_id, course_id=course_id
        ).first()
        if not group:
            return Response({'detail': 'Grupo não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ActivityItemWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = create_item(
            actor=request.user,
            group=group,
            validated_data=serializer.validated_data,
            client_ip=get_client_ip(request),
        )
        return Response(ActivityItemSerializer(item).data, status=status.HTTP_201_CREATED)


class CourseItemDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, course_id, item_id):
        item = ActivityItem.objects.select_related('group__course').filter(
            pk=item_id, group__course_id=course_id
        ).first()
        if not item:
            return Response({'detail': 'Item não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ActivityItemWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = update_item(
            actor=request.user,
            item=item,
            validated_data=serializer.validated_data,
            client_ip=get_client_ip(request),
        )
        return Response(ActivityItemSerializer(updated).data)


class CourseAnalyticsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, course_id):
        course = Course.objects.filter(pk=course_id).first()
        if not course:
            return Response({'detail': 'Curso não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        data = get_course_analytics(actor=request.user, course=course)
        return Response(data)


class CourseEnrollmentListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, course_id):
        course = Course.objects.filter(pk=course_id).first()
        if not course:
            return Response({'detail': 'Curso não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_enrollments(request.user, course):
            return Response(
                {'detail': 'Sem permissão para listar matrículas deste curso.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        enrollments = Enrollment.objects.filter(course=course).select_related(
            'student', 'course', 'course__campus'
        ).order_by('student__full_name')
        return Response(EnrollmentSerializer(enrollments, many=True).data)


class MyEnrollmentsView(generics.ListAPIView):
    serializer_class = EnrollmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Enrollment.objects.filter(
            student=self.request.user,
            course__is_active=True,
        ).exclude(status='CANCELED').select_related(
            'student', 'course', 'course__campus'
        ).order_by('course__name')


class EnrollmentCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = EnrollmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        enrollment = create_enrollment(
            actor=request.user,
            student=serializer.validated_data['student'],
            course=serializer.validated_data['course'],
            enrollment_date=serializer.validated_data['enrollment_date'],
            client_ip=get_client_ip(request),
        )
        return Response(EnrollmentSerializer(enrollment).data, status=status.HTTP_201_CREATED)


class EnrollmentSuspensionListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, enrollment_id):
        enrollment = Enrollment.objects.select_related('course').filter(pk=enrollment_id).first()
        if not enrollment:
            return Response({'detail': 'Matrícula não encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        is_owner = enrollment.student_id == request.user.id
        if not is_owner and not can_manage_enrollments(request.user, enrollment.course):
            return Response(
                {'detail': 'Sem permissão para consultar trancamentos desta matrícula.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        suspensions = EnrollmentSuspension.objects.filter(enrollment=enrollment).order_by('start_date')
        return Response(EnrollmentSuspensionSerializer(suspensions, many=True).data)

    def post(self, request, enrollment_id):
        enrollment = Enrollment.objects.select_related('course').filter(pk=enrollment_id).first()
        if not enrollment:
            return Response({'detail': 'Matrícula não encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = EnrollmentSuspensionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        suspension = create_suspension(
            actor=request.user,
            enrollment=enrollment,
            start_date=serializer.validated_data['start_date'],
            end_date=serializer.validated_data['end_date'],
            reason=serializer.validated_data.get('reason') or '',
            client_ip=get_client_ip(request),
        )
        return Response(
            EnrollmentSuspensionSerializer(suspension).data,
            status=status.HTTP_201_CREATED,
        )
