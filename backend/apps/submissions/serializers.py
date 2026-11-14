import hashlib

from django.core.files.storage import default_storage
from rest_framework import serializers

from .models import Submission


class SubmissionSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True)

    class Meta:
        model = Submission
        fields = [
            'public_id',
            'enrollment',
            'activity_item',
            'description',
            'activity_start_date',
            'activity_end_date',
            'semester',
            'declared_quantity',
            'file',
        ]
        read_only_fields = ['public_id']

    def validate(self, data):
        if data['activity_end_date'] < data['activity_start_date']:
            raise serializers.ValidationError(
                'A data final não pode ser anterior à data inicial.'
            )

        enrollment = data['enrollment']
        activity_item = data['activity_item']

        if enrollment.student != self.context['request'].user:
            raise serializers.ValidationError(
                'Você não pode utilizar uma matrícula de outro aluno.'
            )

        if activity_item.group.course_id != enrollment.course_id:
            raise serializers.ValidationError(
                'A atividade não pertence ao curso da matrícula.'
            )

        if not activity_item.is_active:
            raise serializers.ValidationError(
                'Esta atividade não está disponível.'
            )

        if not enrollment.course.is_active:
            raise serializers.ValidationError(
                'O curso não está ativo.'
            )

        return data

    def create(self, validated_data):
        uploaded_file = validated_data.pop('file')

        file_hash = hashlib.sha256()
        for chunk in uploaded_file.chunks():
            file_hash.update(chunk)

        uploaded_file.seek(0)

        file_path = default_storage.save(
            f'submissions/{uploaded_file.name}',
            uploaded_file
        )

        enrollment = validated_data['enrollment']
        activity_item = validated_data['activity_item']

        return Submission.objects.create(
            **validated_data,
            item_must_be_selectable=activity_item.is_selectable,
            applied_points_per_unit=activity_item.points_per_unit,
            applied_unit_name=activity_item.unit_name,
            applied_max_points_semester=activity_item.max_points_semester,
            file_path=file_path,
            file_ext=uploaded_file.name.split('.')[-1],
            mime_type=uploaded_file.content_type or '',
            file_size_bytes=uploaded_file.size,
            file_hash_sha256=file_hash.hexdigest(),
            status='PENDING',
        )