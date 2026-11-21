from rest_framework import serializers

from .models import Homologation


class HomologationSerializer(serializers.ModelSerializer):
    course = serializers.CharField(source='enrollment.course.name', read_only=True)
    student = serializers.CharField(source='enrollment.student.full_name', read_only=True)
    homologated_by_name = serializers.CharField(source='homologated_by.full_name', read_only=True)
    report_url = serializers.SerializerMethodField()

    class Meta:
        model = Homologation
        fields = (
            'public_id',
            'enrollment',
            'course',
            'student',
            'total_approved_points',
            'required_min_total_points',
            'student_confirmed_at',
            'homologated_by_name',
            'homologated_at',
            'portal_sync_status',
            'report_url',
        )

    def get_report_url(self, obj):
        request = self.context.get('request')
        url = f'/api/v1/homologation/{obj.public_id}/report/'
        return request.build_absolute_uri(url) if request else url
