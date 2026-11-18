
import uuid

from django.db import models
from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin
)


class Campus(models.Model):
    name = models.CharField(max_length=150)
    acronym = models.CharField(max_length=20)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = '"app"."campuses"'

    def __str__(self):
        return self.acronym


class UserManager(BaseUserManager):
    def create_user(self, email, institutional_id, full_name,
                    password=None, **extra_fields):

        if not email:
            raise ValueError('O e-mail é obrigatório.')

        if not extra_fields.get('campus'):
            raise ValueError('O campus do usuário é obrigatório.')

        email = self.normalize_email(email)

        user = self.model(
            email=email,
            institutional_id=institutional_id,
            full_name=full_name,
            **extra_fields
        )

        user.set_password(password)
        user.save(using=self._db)

        return user

    def create_superuser(self, email, institutional_id, full_name,
                         password=None, **extra_fields):

        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_active', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superusuário precisa ter is_staff=True.')

        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superusuário precisa ter is_superuser=True.')

        return self.create_user(
            email,
            institutional_id,
            full_name,
            password,
            **extra_fields
        )


class User(AbstractBaseUser, PermissionsMixin):

    class Role(models.TextChoices):
        STUDENT = 'STUDENT', 'Estudante'
        PROFESSOR = 'PROFESSOR', 'Professor'
        SIAC_COORDINATOR = 'SIAC_COORDINATOR', 'Coordenador do SIAC'

    public_id = models.UUIDField(
        default=uuid.uuid4,
        editable=False,
        unique=True
    )
    institutional_id = models.CharField(max_length=30, unique=True)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=150)

    campus = models.ForeignKey(
        Campus,
        on_delete=models.PROTECT,
        db_column='campus_id',
        related_name='users'
    )

    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['institutional_id', 'full_name']

    objects = UserManager()

    class Meta:
        db_table = '"app"."users"'

    def __str__(self):
        return self.full_name


class UserRole(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        db_column='user_id',
        related_name='roles'
    )

    role = models.CharField(
        max_length=30,
        choices=User.Role.choices
    )

    granted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = '"app"."user_roles"'
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'role'],
                name='unique_user_role'
            )
        ]

    def __str__(self):
        return f'{self.user.full_name} - {self.get_role_display()}'
