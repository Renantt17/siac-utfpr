from rest_framework import serializers

from apps.accounts.models import Campus
from .models import Opportunity


class OpportunitySerializer(serializers.ModelSerializer):
    campus = serializers.PrimaryKeyRelatedField(
        queryset=Campus.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    campus_name = serializers.CharField(source='campus.name', read_only=True, default='Todos os campi / Externo')
    campus_acronym = serializers.CharField(source='campus.acronym', read_only=True, default='GERAL')

    class Meta:
        model = Opportunity
        fields = (
            'public_id',
            'title',
            'description',
            'campus',
            'campus_name',
            'campus_acronym',
            'suggested_group_number',
            'suggested_item_code',
            'start_date',
            'end_date',
            'estimated_hours',
            'modality',
            'is_external',
            'organizer_name',
            'certification_rules',
            'is_active',
            'created_at',
        )
        read_only_fields = ('public_id', 'created_at')

    def validate(self, attrs):
        start = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start and end and end < start:
            raise serializers.ValidationError({
                'end_date': 'A data final não pode ser anterior à data inicial.'
            })

        group = attrs.get('suggested_group_number', getattr(self.instance, 'suggested_group_number', None))
        code = attrs.get('suggested_item_code', getattr(self.instance, 'suggested_item_code', None))
        if (group is None) != (not code):
            raise serializers.ValidationError({
                'suggested_item_code': 'Informe grupo e código juntos, ou deixe ambos vazios.'
            })
        return attrs
