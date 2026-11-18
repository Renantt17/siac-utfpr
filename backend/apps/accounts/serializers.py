from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers

from .models import Campus, User, UserRole


class CampusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Campus
        fields = ('id', 'name', 'acronym')


class RegisterSerializer(serializers.ModelSerializer):
    campus = serializers.PrimaryKeyRelatedField(
        queryset=Campus.objects.filter(is_active=True)
    )
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    confirmPassword = serializers.CharField(
        write_only=True, required=False, trim_whitespace=False
    )

    class Meta:
        model = User
        fields = (
            'id', 'public_id', 'full_name', 'email',
            'institutional_id', 'campus', 'password', 'confirmPassword',
        )
        read_only_fields = ('id', 'public_id')

    def validate_email(self, value):
        value = User.objects.normalize_email(value).lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('Este e-mail já está cadastrado.')
        return value

    def validate_institutional_id(self, value):
        value = value.strip()
        if User.objects.filter(institutional_id=value).exists():
            raise serializers.ValidationError(
                'Esta identificação institucional já está cadastrada.'
            )
        return value

    def validate_full_name(self, value):
        value = ' '.join(value.split())
        if len(value) < 3:
            raise serializers.ValidationError('Informe o nome completo.')
        return value

    def validate(self, attrs):
        confirmation = attrs.pop('confirmPassword', None)
        if confirmation is not None and confirmation != attrs.get('password'):
            raise serializers.ValidationError({
                'confirmPassword': 'As senhas não coincidem.'
            })
        return attrs

    def validate_password(self, value):
        validate_password(value)
        return value

    @transaction.atomic
    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User.objects.create_user(password=password, **validated_data)
        UserRole.objects.create(user=user, role=User.Role.STUDENT)
        return user



class StudentListSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'public_id', 'full_name', 'email', 'institutional_id')
