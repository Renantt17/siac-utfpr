from django.db import models


class AuditLog(models.Model):
    entity_type = models.CharField(max_length=40)
    entity_id = models.BigIntegerField()
    action = models.CharField(max_length=40)

    actor = models.ForeignKey(
        'accounts.User',
        on_delete=models.PROTECT,
        db_column='actor_id',
        related_name='audit_logs',
        null=True,
        blank=True,
    )

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    previous_status = models.CharField(max_length=30, null=True, blank=True)
    new_status = models.CharField(max_length=30, null=True, blank=True)

    before_snapshot = models.JSONField(null=True, blank=True)
    after_snapshot = models.JSONField(null=True, blank=True)

    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = '"audit"."audit_logs"'
