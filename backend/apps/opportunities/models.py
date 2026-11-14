
import uuid
from django.db import models


class Opportunity(models.Model):
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    title = models.CharField(max_length=150)
    description = models.TextField()

    campus = models.ForeignKey(
        'accounts.Campus',
        on_delete=models.PROTECT,
        db_column='campus_id',
        related_name='opportunities'
    )

    suggested_group_number = models.PositiveIntegerField()
    suggested_item_code = models.CharField(max_length=30)

    start_date = models.DateField()
    end_date = models.DateField()
    estimated_hours = models.DecimalField(max_digits=8, decimal_places=2)

    modality = models.CharField(max_length=30)
    is_external = models.BooleanField(default=False)
    organizer_name = models.CharField(max_length=150)
    certification_rules = models.TextField()

    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        'accounts.UserRole',
        on_delete=models.PROTECT,
        db_column='created_by_id',
        related_name='opportunities'
    )
    created_by_role = models.CharField(max_length=20)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = '"app"."opportunities"'
