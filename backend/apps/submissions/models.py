import uuid

from django.db import models
from django.db.models import F
from django.db.models.functions import Round


class Submission(models.Model):
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pendente'
        CORRECTION_REQUESTED = 'CORRECTION_REQUESTED', 'Correção Solicitada'
        APPROVED = 'APPROVED', 'Aprovada'
        APPROVED_WITH_ADJUSTMENTS = 'APPROVED_WITH_ADJUSTMENTS', 'Aprovada com Ajustes'
        REJECTED = 'REJECTED', 'Indeferida'
        CANCELED = 'CANCELED', 'Cancelada'

    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    enrollment = models.ForeignKey(
        'courses.Enrollment',
        on_delete=models.PROTECT,
        db_column='enrollment_id',
        related_name='submissions',
    )
    activity_item = models.ForeignKey(
        'courses.ActivityItem',
        on_delete=models.PROTECT,
        db_column='activity_item_id',
        related_name='submissions',
    )
    description = models.CharField(max_length=255)
    activity_start_date = models.DateField()
    activity_end_date = models.DateField()
    semester = models.CharField(max_length=6)
    declared_quantity = models.DecimalField(max_digits=6, decimal_places=2)
    validated_quantity = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    original_activity_item = models.ForeignKey(
        'courses.ActivityItem',
        on_delete=models.PROTECT,
        db_column='original_activity_item_id',
        related_name='original_submissions',
    )
    original_semester = models.CharField(max_length=6)
    original_declared_quantity = models.DecimalField(max_digits=6, decimal_places=2)

    applied_points_per_unit = models.DecimalField(max_digits=5, decimal_places=2)
    applied_unit_name = models.CharField(max_length=40)
    applied_max_points_semester = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    calculated_points = models.GeneratedField(
        expression=Round(F('declared_quantity') * F('applied_points_per_unit'), 2),
        output_field=models.DecimalField(max_digits=6, decimal_places=2),
        db_persist=True,
    )
    approved_points = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    file_path = models.CharField(max_length=500)
    file_ext = models.CharField(max_length=5)
    mime_type = models.CharField(max_length=50)
    file_size_bytes = models.IntegerField()
    file_hash_sha256 = models.CharField(max_length=64)

    status = models.CharField(max_length=30, choices=Status.choices, default=Status.PENDING)

    evaluator = models.ForeignKey(
        'accounts.User',
        on_delete=models.PROTECT,
        db_column='evaluator_id',
        related_name='evaluated_submissions',
        null=True,
        blank=True,
    )
    evaluator_feedback = models.TextField(null=True, blank=True)

    was_adjusted = models.BooleanField(default=False)
    row_version = models.IntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    evaluated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = '"app"."submissions"'


class Notification(models.Model):
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    recipient = models.ForeignKey(
        'accounts.User',
        on_delete=models.PROTECT,
        db_column='recipient_id',
        related_name='notifications',
    )
    submission = models.ForeignKey(
        Submission,
        on_delete=models.PROTECT,
        db_column='submission_id',
        related_name='notifications',
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=150)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = '"app"."notifications"'
