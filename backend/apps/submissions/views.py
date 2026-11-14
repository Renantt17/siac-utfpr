
from django.utils import timezone
from django.db.models import Q

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .models import Submission
from .serializers import SubmissionSerializer


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def submission_list(request):

    if request.method == 'GET':
        submissions = Submission.objects.filter(
            enrollment__student=request.user
        ).order_by('-created_at')

        serializer = SubmissionSerializer(
            submissions,
            many=True,
            context={'request': request}
        )

        return Response(serializer.data)

    serializer = SubmissionSerializer(
        data=request.data,
        context={'request': request}
    )

    if serializer.is_valid():
        submission = serializer.save()

        return Response(
            SubmissionSerializer(
                submission,
                context={'request': request}
            ).data,
            status=status.HTTP_201_CREATED
        )

    return Response(
        serializer.errors,
        status=status.HTTP_400_BAD_REQUEST
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pending_submissions(request):

    user = request.user

    is_coordinator = user.roles.filter(
        role='SIAC_COORDINATOR'
    ).exists()

    if is_coordinator:
        submissions = Submission.objects.filter(status='PENDING')
    else:
        submissions = Submission.objects.filter(
            status='PENDING'
        ).filter(
            Q(enrollment__course__coordinator=user) |
            Q(enrollment__course__prac_professor=user)
        )

    submissions = submissions.select_related(
        'enrollment__student',
        'enrollment__course',
        'activity_item'
    ).order_by('-created_at')

    data = []

    for submission in submissions:
        data.append({
            'public_id': str(submission.public_id),
            'student': submission.enrollment.student.full_name,
            'course': submission.enrollment.course.name,
            'activity': submission.activity_item.description,
            'activity_code': submission.activity_item.code,
            'description': submission.description,
            'semester': submission.semester,
            'declared_quantity': submission.declared_quantity,
            'activity_start_date': submission.activity_start_date,
            'activity_end_date': submission.activity_end_date,
            'file_path': submission.file_path,
            'created_at': submission.created_at,
            'status': submission.status,
        })

    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def evaluate_submission(request, public_id):

    try:
        submission = Submission.objects.select_related(
            'enrollment__course'
        ).get(public_id=public_id)
    except Submission.DoesNotExist:
        return Response(
            {'error': 'Submissão não encontrada.'},
            status=status.HTTP_404_NOT_FOUND
        )

    user = request.user
    course = submission.enrollment.course

    is_coordinator = user.roles.filter(
        role='SIAC_COORDINATOR'
    ).exists()

    is_course_responsible = user.pk in [
        course.coordinator_id,
        course.prac_professor_id
    ]

    if not (is_coordinator or is_course_responsible):
        return Response(
            {'error': 'Você não tem permissão para avaliar esta atividade.'},
            status=status.HTTP_403_FORBIDDEN
        )

    if submission.status != 'PENDING':
        return Response(
            {'error': 'Esta atividade já foi avaliada.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    decision = request.data.get('decision')
    feedback = request.data.get('feedback', '')
    validated_quantity = request.data.get(
        'validated_quantity',
        submission.declared_quantity
    )

    if decision not in ['APPROVED', 'REJECTED']:
        return Response(
            {'error': 'Decisão inválida. Use APPROVED ou REJECTED.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        validated_quantity = int(validated_quantity)
    except (TypeError, ValueError):
        return Response(
            {'error': 'Quantidade validada deve ser um número inteiro.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not 0 <= validated_quantity <= submission.declared_quantity:
        return Response(
            {'error': 'Quantidade validada inválida.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    submission.evaluator = user
    submission.evaluator_role = (
        'SIAC_COORDINATOR' if is_coordinator else 'PROFESSOR'
    )
    submission.evaluator_feedback = feedback
    submission.validated_quantity = validated_quantity
    submission.status = decision
    submission.evaluated_at = timezone.now()

    if decision == 'APPROVED':
        points = (
            submission.applied_points_per_unit * validated_quantity
        )
        submission.calculated_points = min(
            points,
            submission.applied_max_points_semester
        )
        submission.approved_points = submission.calculated_points
    else:
        submission.calculated_points = 0
        submission.approved_points = 0

    submission.was_adjusted = (
        validated_quantity != submission.declared_quantity
    )

    submission.save()

    return Response({
        'message': 'Avaliação realizada com sucesso.',
        'public_id': str(submission.public_id),
        'status': submission.status,
        'validated_quantity': submission.validated_quantity,
        'approved_points': submission.approved_points,
        'evaluator': user.full_name,
        'feedback': submission.evaluator_feedback
    })
