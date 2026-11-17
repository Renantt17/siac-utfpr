import hashlib
import uuid

import filetype
from django.core.files.storage import default_storage
from django.db import transaction
from rest_framework import serializers

from .models import Notification, Submission

MAX_UPLOAD_SIZE = 10 * 1024 * 1024
ALLOWED_FILE_TYPES = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
}


class SubmissionCreateSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True)

    class Meta:
        model = Submission
        fields = (
            'public_id', 'enrollment', 'activity_item', 'description',
            'activity_start_date', 'activity_end_date', 'semester',
            'declared_quantity', 'file',
        )
        read_only_fields = ('public_id',)

    def validate_description(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('A descrição é obrigatória.')
        return value

    def validate_semester(self, value):
        import re
        if not re.fullmatch(r'\d{4}-[12]', value.strip()):
            raise serializers.ValidationError(
                'Informe o semestre no formato AAAA-1 ou AAAA-2.'
            )
        return value.strip()

    def validate_declared_quantity(self, value):
        if value < 1:
            raise serializers.ValidationError('A quantidade deve ser maior que zero.')
        return value

    def validate(self, data):
        request = self.context['request']
        enrollment = data['enrollment']
        item = data['activity_item']
        uploaded_file = data['file']

        if enrollment.student_id != request.user.id:
            raise serializers.ValidationError({
                'enrollment': 'A matrícula não pertence ao usuário autenticado.'
            })
        if enrollment.status != 'ACTIVE' or not enrollment.course.is_active:
            raise serializers.ValidationError({
                'enrollment': 'A matrícula ou o curso não está ativo.'
            })
        if item.group.course_id != enrollment.course_id:
            raise serializers.ValidationError({
                'activity_item': 'A atividade não pertence ao curso da matrícula.'
            })
        if not item.is_active or not item.group.is_active:
            raise serializers.ValidationError({
                'activity_item': 'Esta atividade não está disponível.'
            })
        if not item.is_selectable:
            raise serializers.ValidationError({
                'activity_item': 'Esta atividade não pode ser selecionada diretamente.'
            })
        if data['activity_end_date'] < data['activity_start_date']:
            raise serializers.ValidationError({
                'activity_end_date': 'A data final não pode ser anterior à data inicial.'
            })
        if uploaded_file.size > MAX_UPLOAD_SIZE:
            raise serializers.ValidationError({
                'file': 'O arquivo deve ter no máximo 10 MB.'
            })

        uploaded_file.seek(0)
        detected = filetype.guess(uploaded_file.read(261))
        uploaded_file.seek(0)
        if not detected or detected.mime not in ALLOWED_FILE_TYPES:
            raise serializers.ValidationError({
                'file': 'Formato não permitido. Envie PDF, JPG ou PNG.'
            })
        data['_detected_mime'] = detected.mime
        data['_detected_ext'] = ALLOWED_FILE_TYPES[detected.mime]
        return data

    @transaction.atomic
    def create(self, validated_data):
        uploaded_file = validated_data.pop('file')
        mime_type = validated_data.pop('_detected_mime')
        extension = validated_data.pop('_detected_ext')
        item = validated_data['activity_item']

        digest = hashlib.sha256()
        for chunk in uploaded_file.chunks():
            digest.update(chunk)
        uploaded_file.seek(0)

        storage_path = default_storage.save(
            f'submissions/{uuid.uuid4().hex}.{extension}',
            uploaded_file,
        )
        try:
            return Submission.objects.create(
                **validated_data,
                item_must_be_selectable=item.is_selectable,
                applied_points_per_unit=item.points_per_unit,
                applied_unit_name=item.unit_name,
                applied_max_points_semester=item.max_points_semester,
                file_path=storage_path,
                file_ext=extension,
                mime_type=mime_type,
                file_size_bytes=uploaded_file.size,
                file_hash_sha256=digest.hexdigest(),
                status='PENDING',
            )
        except Exception:
            default_storage.delete(storage_path)
            raise


class SubmissionHistorySerializer(serializers.ModelSerializer):
    activity_item = serializers.IntegerField(source='activity_item_id', read_only=True)
    enrollment = serializers.IntegerField(source='enrollment_id', read_only=True)
    activity = serializers.CharField(source='activity_item.description', read_only=True)
    activity_code = serializers.CharField(source='activity_item.code', read_only=True)
    course = serializers.CharField(source='enrollment.course.name', read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = (
            'public_id', 'enrollment', 'activity_item', 'activity',
            'activity_code', 'course', 'description',
            'activity_start_date', 'activity_end_date', 'semester',
            'declared_quantity', 'validated_quantity', 'status',
            'calculated_points', 'approved_points', 'evaluator_feedback',
            'created_at', 'evaluated_at', 'file_url',
        )

    def get_file_url(self, obj):
        request = self.context.get('request')
        if not request:
            return None
        return request.build_absolute_uri(
            f'/api/submissions/{obj.public_id}/file/'
        )


class PendingSubmissionSerializer(serializers.ModelSerializer):
    student = serializers.CharField(source='enrollment.student.full_name', read_only=True)
    course = serializers.CharField(source='enrollment.course.name', read_only=True)
    activity_item = serializers.IntegerField(source='activity_item_id', read_only=True)
    enrollment = serializers.IntegerField(source='enrollment_id', read_only=True)
    activity = serializers.CharField(source='activity_item.description', read_only=True)
    activity_code = serializers.CharField(source='activity_item.code', read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = (
            'public_id', 'enrollment', 'activity_item', 'student', 'course',
            'activity', 'activity_code', 'description', 'semester', 'declared_quantity',
            'activity_start_date', 'activity_end_date', 'created_at',
            'status', 'file_url',
        )

    def get_file_url(self, obj):
        request = self.context.get('request')
        if not request:
            return None
        return request.build_absolute_uri(
            f'/api/submissions/{obj.public_id}/file/'
        )


class NotificationSerializer(serializers.ModelSerializer):
    submission_public_id = serializers.UUIDField(
        source='submission.public_id', read_only=True
    )

    class Meta:
        model = Notification
        fields = (
            'public_id', 'title', 'message', 'is_read',
            'created_at', 'submission_public_id',
        )
