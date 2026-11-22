from django.db import models


class Course(models.Model):
    campus = models.ForeignKey(
        'accounts.Campus',
        on_delete=models.PROTECT,
        db_column='campus_id',
        related_name='courses',
    )
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=20)
    coordinator = models.ForeignKey(
        'accounts.User',
        on_delete=models.PROTECT,
        db_column='coordinator_id',
        related_name='coordinated_courses',
    )
    prac_professor = models.ForeignKey(
        'accounts.User',
        on_delete=models.PROTECT,
        db_column='prac_professor_id',
        related_name='prac_courses',
    )
    min_total_points = models.DecimalField(max_digits=5, decimal_places=2, default=70)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = '"app"."courses"'


class Enrollment(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'ACTIVE', 'Ativa'
        COMPLETED = 'COMPLETED', 'Concluída'
        CANCELED = 'CANCELED', 'Cancelada'

    student = models.ForeignKey(
        'accounts.User',
        on_delete=models.PROTECT,
        db_column='student_id',
        related_name='enrollments',
    )
    course = models.ForeignKey(
        Course,
        on_delete=models.PROTECT,
        db_column='course_id',
        related_name='enrollments',
    )
    enrollment_date = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = '"app"."enrollments"'


class EnrollmentSuspension(models.Model):
    enrollment = models.ForeignKey(
        Enrollment,
        on_delete=models.PROTECT,
        db_column='enrollment_id',
        related_name='suspensions',
    )
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = '"app"."enrollment_suspensions"'


class ActivityGroup(models.Model):
    course = models.ForeignKey(
        Course,
        on_delete=models.PROTECT,
        db_column='course_id',
        related_name='activity_groups',
    )
    group_number = models.SmallIntegerField()
    title = models.CharField(max_length=200)
    min_points = models.DecimalField(max_digits=5, decimal_places=2, default=20)
    is_active = models.BooleanField(default=True)

    class Meta:
        managed = False
        db_table = '"app"."activity_groups"'


class ActivityItem(models.Model):
    group = models.ForeignKey(
        ActivityGroup,
        on_delete=models.PROTECT,
        db_column='group_id',
        related_name='activity_items',
    )
    parent_item = models.ForeignKey(
        'self',
        on_delete=models.PROTECT,
        db_column='parent_item_id',
        related_name='child_items',
        null=True,
        blank=True,
    )
    code = models.CharField(max_length=15)
    description = models.TextField()
    points_per_unit = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    unit_name = models.CharField(max_length=40, null=True, blank=True)
    max_points_semester = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    required_proof_description = models.CharField(max_length=255, null=True, blank=True)
    is_selectable = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = '"app"."activity_items"'
