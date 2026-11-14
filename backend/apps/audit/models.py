
from django.db import models


class AuditLog(models.Model):
    entity_type = models.CharField(max_length=50)
    entity_id = models.PositiveBigIntegerField()
    action = models.CharField(max_length=50)

    actor_id = models.PositiveBigIntegerField()

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    previous_status = models.CharField(max_length=30, null=True, blank=True)
    new_status = models.CharField(max_length=30, null=True, blank=True)

    before_snapshot = models.JSONField(null=True, blank=True)
    after_snapshot = models.JSONField(null=True, blank=True)

    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = '"audit"."audit_logs"'
