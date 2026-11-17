from rest_framework import serializers

from .models import ActivityGroup, ActivityItem, Course, Enrollment


class CourseSerializer(serializers.ModelSerializer):
    campus_name = serializers.CharField(source='campus.name', read_only=True)
    campus_acronym = serializers.CharField(source='campus.acronym', read_only=True)

    class Meta:
        model = Course
        fields = (
            'id', 'name', 'code', 'campus', 'campus_name',
            'campus_acronym', 'min_total_points', 'is_active',
        )


class EnrollmentSerializer(serializers.ModelSerializer):
    course_name = serializers.CharField(source='course.name', read_only=True)
    course_code = serializers.CharField(source='course.code', read_only=True)
    campus_acronym = serializers.CharField(
        source='course.campus.acronym', read_only=True
    )

    class Meta:
        model = Enrollment
        fields = (
            'id', 'course', 'course_name', 'course_code',
            'campus_acronym', 'enrollment_date', 'status',
        )
        read_only_fields = ('id',)


class EnrollmentCreateSerializer(serializers.Serializer):
    student_id = serializers.IntegerField()
    course_id = serializers.IntegerField()
    enrollment_date = serializers.DateField()

    def validate(self, attrs):
        from apps.accounts.models import User
        from .models import Course

        try:
            student = User.objects.get(pk=attrs['student_id'], is_active=True)
        except User.DoesNotExist:
            raise serializers.ValidationError({'student_id': 'Estudante não encontrado.'})

        try:
            course = Course.objects.get(pk=attrs['course_id'], is_active=True)
        except Course.DoesNotExist:
            raise serializers.ValidationError({'course_id': 'Curso não encontrado ou inativo.'})

        if not student.roles.filter(role='STUDENT').exists():
            raise serializers.ValidationError({'student_id': 'O usuário não possui perfil de estudante.'})
        if student.campus_id != course.campus_id:
            raise serializers.ValidationError({'course_id': 'O curso pertence a outro campus.'})
        attrs['student'] = student
        attrs['course'] = course
        return attrs


class ActivityItemSerializer(serializers.ModelSerializer):
    group_id = serializers.IntegerField(read_only=True)
    group_number = serializers.IntegerField(source='group.group_number', read_only=True)
    group_title = serializers.CharField(source='group.title', read_only=True)
    course_id = serializers.IntegerField(source='group.course_id', read_only=True)

    class Meta:
        model = ActivityItem
        fields = (
            'id', 'code', 'description', 'group_id', 'group_number',
            'group_title', 'course_id', 'points_per_unit', 'unit_name',
            'max_points_semester', 'required_proof_description',
            'is_selectable', 'parent_item', 'parent_required_selectable',
        )


class ActivityGroupSerializer(serializers.ModelSerializer):
    activities = ActivityItemSerializer(
        source='activity_items', many=True, read_only=True
    )

    class Meta:
        model = ActivityGroup
        fields = ('id', 'group_number', 'title', 'min_points', 'activities')
