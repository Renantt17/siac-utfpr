
import uuid
from django.db import models


class Homologation(models.Model):
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    enrollment = models.ForeignKey(
        'courses.Enrollment',
        on_delete=models.PROTECT,
        db_column='enrollment_id',
        related_name='homologations'
    )
    total_approved_points = models.DecimalField(max_digits=10, decimal_places=2)
    required_min_total_points = models.DecimalField(max_digits=10, decimal_places=2)

    report_pdf_path = models.CharField(max_length=500)
    report_pdf_hash_sha256 = models.CharField(max_length=64)

    student_confirmed_at = models.DateTimeField(null=True, blank=True)

    homologated_by = models.ForeignKey(
        'accounts.UserRole',
        on_delete=models.PROTECT,
        db_column='homologated_by_id',
        related_name='homologations',
        null=True,
        blank=True
    )
    homologated_by_role = models.CharField(max_length=20, null=True, blank=True)
    homologated_at = models.DateTimeField(null=True, blank=True)

    portal_sync_status = models.CharField(max_length=30)
    portal_synced_at = models.DateTimeField(null=True, blank=True)
    portal_error_log = models.TextField(null=True, blank=True)

    class Meta:
        db_table = '"app"."homologations"'


class HomologationGroupScore(models.Model):
    homologation = models.ForeignKey(
        Homologation,
        on_delete=models.PROTECT,
        db_column='homologation_id',
        related_name='group_scores'
    )
    group = models.ForeignKey(
        'courses.ActivityGroup',
        on_delete=models.PROTECT,
        db_column='group_id',
        related_name='homologation_scores'
    )
    approved_points = models.DecimalField(max_digits=10, decimal_places=2)
    required_min_points = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = '"app"."homologation_group_scores"'
