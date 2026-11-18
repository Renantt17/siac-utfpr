
import uuid
from django.db import models


class Submission(models.Model):
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    enrollment = models.ForeignKey(
        'courses.Enrollment',
        on_delete=models.PROTECT,
        db_column='enrollment_id',
        related_name='submissions'
    )
    activity_item = models.ForeignKey(
        'courses.ActivityItem',
        on_delete=models.PROTECT,
        db_column='activity_item_id',
        related_name='submissions'
    )
    item_must_be_selectable = models.BooleanField(default=False)
    description = models.TextField()
    activity_start_date = models.DateField()
    activity_end_date = models.DateField()
    semester = models.CharField(max_length=20)
    declared_quantity = models.PositiveIntegerField()
    validated_quantity = models.PositiveIntegerField(default=0)

    original_activity_item = models.ForeignKey(
        'courses.ActivityItem',
        on_delete=models.PROTECT,
        db_column='original_activity_item_id',
        related_name='original_submissions',
        null=True,
        blank=True
    )
    original_semester = models.CharField(max_length=20, null=True, blank=True)
    original_declared_quantity = models.PositiveIntegerField(null=True, blank=True)

    applied_points_per_unit = models.DecimalField(max_digits=10, decimal_places=2)
    applied_unit_name = models.CharField(max_length=50)
    applied_max_points_semester = models.DecimalField(max_digits=10, decimal_places=2)
    calculated_points = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    approved_points = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    file_path = models.CharField(max_length=500)
    file_ext = models.CharField(max_length=20)
    mime_type = models.CharField(max_length=100)
    file_size_bytes = models.PositiveBigIntegerField()
    file_hash_sha256 = models.CharField(max_length=64)

    status = models.CharField(max_length=30)

    evaluator = models.ForeignKey(
        'accounts.User',
        on_delete=models.PROTECT,
        db_column='evaluator_id',
        related_name='evaluated_submissions',
        null=True,
        blank=True
    )
    evaluator_role = models.CharField(max_length=20, null=True, blank=True)
    evaluator_feedback = models.TextField(null=True, blank=True)

    was_adjusted = models.BooleanField(default=False)
    row_version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    evaluated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = '"app"."submissions"'


class Notification(models.Model):
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    recipient = models.ForeignKey(
        'accounts.User',
        on_delete=models.PROTECT,
        db_column='recipient_id',
        related_name='notifications'
    )
    submission = models.ForeignKey(
        Submission,
        on_delete=models.PROTECT,
        db_column='submission_id',
        related_name='notifications'
    )
    title = models.CharField(max_length=150)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = '"app"."notifications"'
