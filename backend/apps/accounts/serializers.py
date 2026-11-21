from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Campus, User
from .services import authenticate_user_by_identifier


class CampusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Campus
        fields = ('id', 'name', 'acronym')


class UserProfileSerializer(serializers.Serializer):
    id = serializers.UUIDField(source='public_id')
    numeric_id = serializers.IntegerField(source='id')
    email = serializers.EmailField()
    full_name = serializers.CharField()
    institutional_id = serializers.CharField()
    primary_role = serializers.CharField()
    campus = serializers.CharField(source='campus.acronym')
    campus_id = serializers.IntegerField()
    campus_name = serializers.CharField(source='campus.name')
    roles = serializers.SerializerMethodField()

    def get_roles(self, obj):
        return obj.get_roles()


class HybridTokenObtainSerializer(serializers.Serializer):
    identifier = serializers.CharField(required=False, allow_blank=False)
    email = serializers.CharField(required=False, allow_blank=False)
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        identifier = attrs.get('identifier') or attrs.get('email')
        if not identifier:
            raise serializers.ValidationError(
                {'identifier': 'Informe seu RA ou e-mail institucional.'}
            )
        user = authenticate_user_by_identifier(identifier, attrs['password'])
        refresh = RefreshToken.for_user(user)
        return {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': UserProfileSerializer(user).data,
        }


class StudentListSerializer(serializers.ModelSerializer):
    campus_acronym = serializers.CharField(source='campus.acronym', read_only=True)

    class Meta:
        model = User
        fields = ('id', 'public_id', 'full_name', 'email', 'institutional_id', 'campus_id', 'campus_acronym')


class AdminUserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    public_id = serializers.UUIDField()
    institutional_id = serializers.CharField()
    email = serializers.EmailField()
    full_name = serializers.CharField()
    primary_role = serializers.CharField()
    campus_id = serializers.IntegerField()
    campus_name = serializers.CharField()
    campus_acronym = serializers.CharField()
    is_active = serializers.BooleanField()
    roles = serializers.ListField(child=serializers.CharField())
