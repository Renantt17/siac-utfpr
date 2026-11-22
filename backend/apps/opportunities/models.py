import uuid

from django.db import models


class Opportunity(models.Model):
    class Modality(models.TextChoices):
        PRESENCIAL = 'PRESENCIAL', 'Presencial'
        REMOTO = 'REMOTO', 'Remoto'
        HIBRIDO = 'HIBRIDO', 'Híbrido'

    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    title = models.CharField(max_length=200)
    description = models.TextField()

    campus = models.ForeignKey(
        'accounts.Campus',
        on_delete=models.PROTECT,
        db_column='campus_id',
        related_name='opportunities',
        null=True,
        blank=True,
    )

    suggested_group_number = models.SmallIntegerField(null=True, blank=True)
    suggested_item_code = models.CharField(max_length=15, null=True, blank=True)

    start_date = models.DateField()
    end_date = models.DateField()
    estimated_hours = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    modality = models.CharField(max_length=15, choices=Modality.choices)
    is_external = models.BooleanField(default=False)
    organizer_name = models.CharField(max_length=200)
    certification_rules = models.TextField()

    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.PROTECT,
        db_column='created_by_id',
        related_name='opportunities',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = '"app"."opportunities"'
