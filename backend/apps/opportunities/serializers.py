from rest_framework import serializers
from .models import Opportunity


class OpportunitySerializer(serializers.ModelSerializer):
    campus_name = serializers.CharField(source='campus.name', read_only=True)

    class Meta:
        model = Opportunity
        fields = (
            'public_id', 'title', 'description', 'campus', 'campus_name',
            'suggested_group_number', 'suggested_item_code', 'start_date',
            'end_date', 'estimated_hours', 'modality', 'is_external',
            'organizer_name', 'certification_rules', 'is_active',
            'created_at',
        )
        read_only_fields = ('public_id', 'created_at', 'is_active')

    def validate(self, attrs):
        start = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start and end and end < start:
            raise serializers.ValidationError({
                'end_date': 'A data final não pode ser anterior à data inicial.'
            })
        return attrs
