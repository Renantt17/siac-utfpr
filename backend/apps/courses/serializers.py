from decimal import Decimal
from rest_framework import serializers

from apps.accounts.models import Campus, User
from .models import (
    ActivityGroup,
    ActivityItem,
    Course,
    Enrollment,
    EnrollmentSuspension,
)


class CourseSerializer(serializers.ModelSerializer):
    campus_name = serializers.CharField(source='campus.name', read_only=True)
    campus_acronym = serializers.CharField(source='campus.acronym', read_only=True)
    coordinator_name = serializers.CharField(source='coordinator.full_name', read_only=True)
    prac_professor_name = serializers.CharField(source='prac_professor.full_name', read_only=True)

    class Meta:
        model = Course
        fields = (
            'id',
            'name',
            'code',
            'campus',
            'campus_name',
            'campus_acronym',
            'coordinator',
            'coordinator_name',
            'prac_professor',
            'prac_professor_name',
            'min_total_points',
            'is_active',
        )


class CourseCreateSerializer(serializers.Serializer):
    campus = serializers.PrimaryKeyRelatedField(queryset=Campus.objects.filter(is_active=True))
    name = serializers.CharField(max_length=150)
    code = serializers.CharField(max_length=20)
    coordinator = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(is_active=True))
    prac_professor = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(is_active=True))
    min_total_points = serializers.DecimalField(max_digits=5, decimal_places=2, required=False)
    use_default_table = serializers.BooleanField(default=True, required=False)

    def validate(self, attrs):
        if not attrs['coordinator'].has_role('COURSE_COORD'):
            raise serializers.ValidationError({
                'coordinator': 'O usuário selecionado não possui o papel COURSE_COORD.'
            })
        if not attrs['prac_professor'].has_role('PROFESSOR'):
            raise serializers.ValidationError({
                'prac_professor': 'O usuário selecionado não possui o papel PROFESSOR (PRAC).'
            })
        return attrs


class CourseUpdateSerializer(serializers.Serializer):
    campus = serializers.PrimaryKeyRelatedField(
        queryset=Campus.objects.filter(is_active=True), required=False
    )
    name = serializers.CharField(max_length=150, required=False)
    code = serializers.CharField(max_length=20, required=False)
    coordinator = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True), required=False
    )
    prac_professor = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True), required=False
    )
    min_total_points = serializers.DecimalField(max_digits=5, decimal_places=2, required=False)
    is_active = serializers.BooleanField(required=False)

    def validate(self, attrs):
        if 'coordinator' in attrs and not attrs['coordinator'].has_role('COURSE_COORD'):
            raise serializers.ValidationError({
                'coordinator': 'O usuário selecionado não possui o papel COURSE_COORD.'
            })
        if 'prac_professor' in attrs and not attrs['prac_professor'].has_role('PROFESSOR'):
            raise serializers.ValidationError({
                'prac_professor': 'O usuário selecionado não possui o papel PROFESSOR.'
            })
        return attrs


class EnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_institutional_id = serializers.CharField(
        source='student.institutional_id', read_only=True
    )
    course_name = serializers.CharField(source='course.name', read_only=True)
    course_code = serializers.CharField(source='course.code', read_only=True)
    campus_acronym = serializers.CharField(source='course.campus.acronym', read_only=True)

    class Meta:
        model = Enrollment
        fields = (
            'id',
            'student',
            'student_name',
            'student_institutional_id',
            'course',
            'course_name',
            'course_code',
            'campus_acronym',
            'enrollment_date',
            'status',
        )
        read_only_fields = ('id',)


class EnrollmentCreateSerializer(serializers.Serializer):
    student_id = serializers.IntegerField()
    course_id = serializers.IntegerField()
    enrollment_date = serializers.DateField()

    def validate(self, attrs):
        try:
            student = User.objects.get(pk=attrs['student_id'], is_active=True)
        except User.DoesNotExist:
            raise serializers.ValidationError({'student_id': 'Estudante não encontrado.'})

        try:
            course = Course.objects.get(pk=attrs['course_id'], is_active=True)
        except Course.DoesNotExist:
            raise serializers.ValidationError({'course_id': 'Curso não encontrado ou inativo.'})

        if not student.has_role('STUDENT'):
            raise serializers.ValidationError({'student_id': 'O usuário não possui perfil de estudante.'})
        if student.campus_id != course.campus_id:
            raise serializers.ValidationError({'course_id': 'O curso pertence a outro campus.'})
        attrs['student'] = student
        attrs['course'] = course
        return attrs


class EnrollmentSuspensionSerializer(serializers.ModelSerializer):
    class Meta:
        model = EnrollmentSuspension
        fields = ('id', 'enrollment', 'start_date', 'end_date', 'reason', 'created_at')
        read_only_fields = ('id', 'enrollment', 'created_at')


class ActivityItemSerializer(serializers.ModelSerializer):
    group_id = serializers.IntegerField(read_only=True)
    group_number = serializers.IntegerField(source='group.group_number', read_only=True)
    group_title = serializers.CharField(source='group.title', read_only=True)
    course_id = serializers.IntegerField(source='group.course_id', read_only=True)
    parent_code = serializers.CharField(source='parent_item.code', read_only=True, default=None)
    effective_max_points_semester = serializers.SerializerMethodField()

    class Meta:
        model = ActivityItem
        fields = (
            'id',
            'code',
            'description',
            'group_id',
            'group_number',
            'group_title',
            'course_id',
            'points_per_unit',
            'unit_name',
            'max_points_semester',
            'effective_max_points_semester',
            'required_proof_description',
            'is_selectable',
            'is_active',
            'parent_item',
            'parent_code',
        )

    def get_effective_max_points_semester(self, obj):
        if obj.parent_item_id and obj.parent_item:
            return obj.parent_item.max_points_semester
        return obj.max_points_semester


class ActivityGroupSerializer(serializers.ModelSerializer):
    activities = ActivityItemSerializer(source='activity_items', many=True, read_only=True)

    class Meta:
        model = ActivityGroup
        fields = ('id', 'group_number', 'title', 'min_points', 'is_active', 'activities')


class ActivityGroupWriteSerializer(serializers.Serializer):
    group_number = serializers.IntegerField(min_value=1, required=False)
    title = serializers.CharField(max_length=200, required=False)
    min_points = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, required=False)
    is_active = serializers.BooleanField(required=False)


class ActivityItemWriteSerializer(serializers.Serializer):
    parent_item = serializers.PrimaryKeyRelatedField(
        queryset=ActivityItem.objects.all(), required=False, allow_null=True
    )
    code = serializers.CharField(max_length=15, required=False)
    description = serializers.CharField(required=False)
    points_per_unit = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal('0.01'), required=False, allow_null=True
    )
    unit_name = serializers.CharField(max_length=40, required=False, allow_null=True, allow_blank=True)
    max_points_semester = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal('0.01'), required=False, allow_null=True
    )
    required_proof_description = serializers.CharField(
        max_length=255, required=False, allow_null=True, allow_blank=True
    )
    is_selectable = serializers.BooleanField(required=False)
    is_active = serializers.BooleanField(required=False)
