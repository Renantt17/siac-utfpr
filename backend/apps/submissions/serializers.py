from decimal import Decimal
import re

from rest_framework import serializers

from .models import Notification, Submission


def _validate_semester_fmt(value: str) -> str:
    clean = value.strip()
    if not re.fullmatch(r'\d{4}\.[12]', clean):
        raise serializers.ValidationError('Informe o semestre no formato AAAA.1 ou AAAA.2.')
    return clean


class SubmissionCreateSerializer(serializers.Serializer):
    enrollment = serializers.IntegerField()
    activity_item = serializers.IntegerField()
    description = serializers.CharField(max_length=255)
    activity_start_date = serializers.DateField()
    activity_end_date = serializers.DateField()
    semester = serializers.CharField(required=False, allow_blank=True)
    declared_quantity = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=Decimal('0.01'))
    file = serializers.FileField()

    def validate_description(self, value):
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError('A descrição é obrigatória.')
        return clean

    def validate_semester(self, value):
        if not value or not value.strip():
            return ''
        return _validate_semester_fmt(value)

    def validate(self, attrs):
        from apps.courses.models import ActivityItem, Enrollment

        enrollment = Enrollment.objects.select_related('course').filter(pk=attrs['enrollment']).first()
        if not enrollment:
            raise serializers.ValidationError({'enrollment': 'Matrícula não encontrada.'})
        item = ActivityItem.objects.select_related('group', 'parent_item').filter(pk=attrs['activity_item']).first()
        if not item:
            raise serializers.ValidationError({'activity_item': 'Item de atividade não encontrado.'})
        attrs['enrollment'] = enrollment
        attrs['activity_item'] = item
        return attrs


class SubmissionUpdateSerializer(serializers.Serializer):
    activity_item = serializers.IntegerField(required=False)
    description = serializers.CharField(max_length=255, required=False)
    activity_start_date = serializers.DateField(required=False)
    activity_end_date = serializers.DateField(required=False)
    declared_quantity = serializers.DecimalField(
        max_digits=6, decimal_places=2, min_value=Decimal('0.01'), required=False
    )
    row_version = serializers.IntegerField(required=False)
    file = serializers.FileField(required=False)

    def validate(self, attrs):
        if 'activity_item' in attrs:
            from apps.courses.models import ActivityItem
            item = ActivityItem.objects.select_related('group', 'parent_item').filter(
                pk=attrs['activity_item']
            ).first()
            if not item:
                raise serializers.ValidationError({'activity_item': 'Item de atividade não encontrado.'})
            attrs['activity_item'] = item
        return attrs


class SubmissionDetailSerializer(serializers.ModelSerializer):
    activity_item = serializers.IntegerField(source='activity_item_id', read_only=True)
    enrollment = serializers.IntegerField(source='enrollment_id', read_only=True)
    activity = serializers.CharField(source='activity_item.description', read_only=True)
    activity_code = serializers.CharField(source='activity_item.code', read_only=True)
    group_id = serializers.IntegerField(source='activity_item.group_id', read_only=True)
    group_number = serializers.IntegerField(source='activity_item.group.group_number', read_only=True)
    group_title = serializers.CharField(source='activity_item.group.title', read_only=True)
    course = serializers.CharField(source='enrollment.course.name', read_only=True)
    course_id = serializers.IntegerField(source='enrollment.course_id', read_only=True)
    original_activity_code = serializers.CharField(source='original_activity_item.code', read_only=True)
    original_activity_description = serializers.CharField(
        source='original_activity_item.description', read_only=True
    )
    evaluator_name = serializers.CharField(source='evaluator.full_name', read_only=True, default=None)
    calculated_points = serializers.DecimalField(max_digits=6, decimal_places=2, read_only=True)
    student = serializers.CharField(source='enrollment.student.full_name', read_only=True)
    student_institutional_id = serializers.CharField(
        source='enrollment.student.institutional_id', read_only=True
    )
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = (
            'public_id',
            'enrollment',
            'course_id',
            'course',
            'student',
            'student_institutional_id',
            'group_id',
            'group_number',
            'group_title',
            'activity_item',
            'activity_code',
            'activity',
            'description',
            'activity_start_date',
            'activity_end_date',
            'semester',
            'declared_quantity',
            'validated_quantity',
            'original_activity_item_id',
            'original_activity_code',
            'original_activity_description',
            'original_semester',
            'original_declared_quantity',
            'applied_points_per_unit',
            'applied_unit_name',
            'applied_max_points_semester',
            'calculated_points',
            'approved_points',
            'status',
            'was_adjusted',
            'evaluator_name',
            'evaluator_feedback',
            'row_version',
            'created_at',
            'updated_at',
            'evaluated_at',
            'file_url',
        )

    def get_file_url(self, obj):
        request = self.context.get('request')
        url = f'/api/v1/submissions/{obj.public_id}/file/'
        return request.build_absolute_uri(url) if request else url


class NotificationSerializer(serializers.ModelSerializer):
    submission_public_id = serializers.UUIDField(
        source='submission.public_id', read_only=True, default=None
    )

    class Meta:
        model = Notification
        fields = ('public_id', 'title', 'message', 'is_read', 'created_at', 'submission_public_id')
