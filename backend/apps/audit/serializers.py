from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source='actor.full_name', read_only=True, default=None)
    actor_institutional_id = serializers.CharField(
        source='actor.institutional_id', read_only=True, default=None
    )

    class Meta:
        model = AuditLog
        fields = (
            'id',
            'entity_type',
            'entity_id',
            'action',
            'actor_id',
            'actor_name',
            'actor_institutional_id',
            'ip_address',
            'previous_status',
            'new_status',
            'before_snapshot',
            'after_snapshot',
            'notes',
            'created_at',
        )
