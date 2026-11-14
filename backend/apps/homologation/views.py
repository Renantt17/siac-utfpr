from decimal import Decimal

from django.db.models import Sum
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.courses.models import Enrollment
from apps.submissions.models import Submission


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def homologation_summary(request):

    enrollments = Enrollment.objects.filter(
        student=request.user
    ).select_related('course')

    results = []

    for enrollment in enrollments:

        submissions = Submission.objects.filter(
            enrollment=enrollment,
            status='APPROVED'
        )

        total_points = submissions.aggregate(
            total=Sum('approved_points')
        )['total'] or Decimal('0.00')

        groups = []

        for group in enrollment.course.activity_groups.all():

            group_points = submissions.filter(
                activity_item__group=group
            ).aggregate(
                total=Sum('approved_points')
            )['total'] or Decimal('0.00')

            groups.append({
                'group_id': group.id,
                'group_number': group.group_number,
                'title': group.title,
                'approved_points': group_points,
                'required_min_points': group.min_points,
                'minimum_reached': group_points >= group.min_points,
            })

        results.append({
            'enrollment_id': enrollment.id,
            'course': enrollment.course.name,
            'total_approved_points': total_points,
            'required_min_total_points': enrollment.course.min_total_points,
            'minimum_reached': (
                total_points >= enrollment.course.min_total_points
            ),
            'groups': groups,
        })

    return Response(results)