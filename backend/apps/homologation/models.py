import uuid

from django.db import models


class Homologation(models.Model):
    class PortalSyncStatus(models.TextChoices):
        PENDING_SYNC = 'PENDING_SYNC', 'Pendente de sincronização'
        SYNCED = 'SYNCED', 'Sincronizado'
        SYNC_FAILED = 'SYNC_FAILED', 'Falha na sincronização'

    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    enrollment = models.OneToOneField(
        'courses.Enrollment',
        on_delete=models.PROTECT,
        db_column='enrollment_id',
        related_name='homologation',
    )
    total_approved_points = models.DecimalField(max_digits=6, decimal_places=2)
    required_min_total_points = models.DecimalField(max_digits=6, decimal_places=2)

    report_pdf_path = models.CharField(max_length=500)
    report_pdf_hash_sha256 = models.CharField(max_length=64)

    student_confirmed_at = models.DateTimeField(null=True, blank=True)

    homologated_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.PROTECT,
        db_column='homologated_by_id',
        related_name='homologations',
    )
    homologated_at = models.DateTimeField(auto_now_add=True)

    portal_sync_status = models.CharField(
        max_length=20,
        choices=PortalSyncStatus.choices,
        default=PortalSyncStatus.PENDING_SYNC,
    )
    portal_synced_at = models.DateTimeField(null=True, blank=True)
    portal_error_log = models.TextField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = '"app"."homologations"'


class HomologationGroupScore(models.Model):
    homologation = models.ForeignKey(
        Homologation,
        on_delete=models.PROTECT,
        db_column='homologation_id',
        related_name='group_scores',
    )
    group = models.ForeignKey(
        'courses.ActivityGroup',
        on_delete=models.PROTECT,
        db_column='group_id',
        related_name='homologation_scores',
    )
    approved_points = models.DecimalField(max_digits=5, decimal_places=2)
    required_min_points = models.DecimalField(max_digits=5, decimal_places=2)

    class Meta:
        managed = False
        db_table = '"app"."homologation_group_scores"'
