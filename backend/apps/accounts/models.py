import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager
from django.db import connection, models


class Campus(models.Model):
    name = models.CharField(max_length=120)
    acronym = models.CharField(max_length=10, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = '"app"."campuses"'

    def __str__(self):
        return f'{self.name} ({self.acronym})'


class UserManager(BaseUserManager):
    def create_user(
        self,
        email,
        institutional_id,
        full_name,
        password=None,
        primary_role='STUDENT',
        **extra_fields,
    ):
        if not email:
            raise ValueError('O e-mail é obrigatório.')
        if not institutional_id:
            raise ValueError('A identificação institucional é obrigatória.')
        if not extra_fields.get('campus') and not extra_fields.get('campus_id'):
            raise ValueError('O campus do usuário é obrigatório.')

        email = self.normalize_email(email).lower()
        user = self.model(
            email=email,
            institutional_id=institutional_id.strip(),
            full_name=full_name.strip(),
            primary_role=primary_role,
            **extra_fields,
        )
        user.set_password(password)
        user.save(using=self._db)
        return user


class User(AbstractBaseUser):
    class Role(models.TextChoices):
        STUDENT = 'STUDENT', 'Estudante'
        PROFESSOR = 'PROFESSOR', 'Docente Responsável (PRAC)'
        COURSE_COORD = 'COURSE_COORD', 'Coordenação de Curso'
        SIAC_COORD = 'SIAC_COORD', 'Coordenador do SIAC-UTFPR'

    last_login = None

    public_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    institutional_id = models.CharField(max_length=30, unique=True)
    email = models.EmailField(max_length=150, unique=True)
    password = models.CharField(max_length=255, db_column='password_hash')
    full_name = models.CharField(max_length=150)
    primary_role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.STUDENT,
    )
    campus = models.ForeignKey(
        Campus,
        on_delete=models.PROTECT,
        db_column='campus_id',
        related_name='users',
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['institutional_id', 'full_name']

    objects = UserManager()

    class Meta:
        managed = False
        db_table = '"app"."users"'

    def __str__(self):
        return f'{self.full_name} ({self.institutional_id})'

    def get_roles(self) -> list[str]:
        if not self.pk:
            return []
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT role FROM app.user_roles WHERE user_id = %s ORDER BY granted_at, role',
                [self.pk],
            )
            return [row[0] for row in cursor.fetchall()]

    def has_role(self, *roles: str) -> bool:
        user_roles = set(self.get_roles())
        return bool(user_roles.intersection(roles))

    @property
    def is_staff(self) -> bool:
        return self.has_role(self.Role.SIAC_COORD)

    @property
    def is_superuser(self) -> bool:
        return self.has_role(self.Role.SIAC_COORD)

    def has_perm(self, perm, obj=None):
        return self.is_superuser

    def has_module_perms(self, app_label):
        return self.is_superuser
