from datetime import timedelta
from io import BytesIO
import hashlib

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from reportlab.pdfgen import canvas

from apps.accounts.models import Campus, User, UserRole
from apps.courses.models import ActivityGroup, ActivityItem, Course, Enrollment
from apps.submissions.models import Submission


class Command(BaseCommand):
    help = 'Cria dados reproduzíveis de desenvolvimento para o SIAC.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--password',
            required=True,
            help='Senha local para as contas de demonstração.',
        )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('seed_dev só pode ser executado com DEBUG=True.')

        password = options['password']
        validate_password(password)

        campus, _ = Campus.objects.get_or_create(
            acronym='DEMO',
            defaults={'name': 'Campus de Demonstração', 'is_active': True},
        )

        professor = self._user(
            email='professor@siac.local',
            institutional_id='DEMO-PROF-001',
            full_name='Professor de Demonstração',
            campus=campus,
            password=password,
            role='PROFESSOR',
        )
        coordinator = self._user(
            email='coordenador@siac.local',
            institutional_id='DEMO-COORD-001',
            full_name='Coordenador de Demonstração',
            campus=campus,
            password=password,
            role='SIAC_COORDINATOR',
        )
        student = self._user(
            email='estudante@siac.local',
            institutional_id='DEMO-ALUNO-001',
            full_name='Estudante de Demonstração',
            campus=campus,
            password=password,
            role='STUDENT',
        )

        course, _ = Course.objects.get_or_create(
            campus=campus,
            code='DEMO-SIAC',
            defaults={
                'name': 'Curso de Demonstração',
                'coordinator': professor,
                'prac_professor': professor,
                'min_total_points': 5,
                'is_active': True,
            },
        )
        enrollment, _ = Enrollment.objects.get_or_create(
            student=student,
            course=course,
            defaults={
                'enrollment_date': timezone.localdate(),
                'status': 'ACTIVE',
            },
        )
        group, _ = ActivityGroup.objects.get_or_create(
            course=course,
            group_number=1,
            defaults={
                'title': 'Atividades Acadêmicas',
                'min_points': 5,
                'is_active': True,
            },
        )
        item, _ = ActivityItem.objects.get_or_create(
            group=group,
            code='DEMO001',
            defaults={
                'description': 'Participação em evento acadêmico',
                'points_per_unit': 5,
                'unit_name': 'evento',
                'max_points_semester': 20,
                'required_proof_description': 'Certificado de participação',
                'is_selectable': True,
                'is_active': True,
            },
        )

        today = timezone.localdate()
        semester = f'{today.year}-{1 if today.month <= 6 else 2}'
        self._submission(
            enrollment, item, professor, 'PENDING',
            'Atividade pendente', semester,
        )
        self._submission(
            enrollment, item, professor, 'APPROVED',
            'Atividade aprovada', semester,
        )
        self._submission(
            enrollment, item, professor, 'REJECTED',
            'Atividade rejeitada', semester,
        )

        self.stdout.write(self.style.SUCCESS(
            'Dados de demonstração criados/confirmados.'
        ))
        self.stdout.write(
            'Contas: estudante@siac.local, professor@siac.local, '
            'coordenador@siac.local (senha informada em --password).'
        )

    @staticmethod
    def _user(email, institutional_id, full_name, campus, password, role):
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'institutional_id': institutional_id,
                'full_name': full_name,
                'campus': campus,
                'is_active': True,
            },
        )
        if created:
            user.set_password(password)
            user.save(update_fields=['password'])
        UserRole.objects.get_or_create(user=user, role=role)
        return user

    @staticmethod
    def _submission(enrollment, item, professor, state, description, semester):
        existing = Submission.objects.filter(
            enrollment=enrollment,
            activity_item=item,
            description=description,
            semester=semester,
        ).first()
        if existing:
            return existing

        buffer = BytesIO()
        pdf = canvas.Canvas(buffer)
        pdf.drawString(72, 760, f'SIAC - comprovante de demonstração: {description}')
        pdf.save()
        file_bytes = buffer.getvalue()
        file_path = default_storage.save(
            f'seed/{state.lower()}-comprovante.pdf',
            ContentFile(file_bytes),
        )
        today = timezone.localdate()
        return Submission.objects.create(
            enrollment=enrollment,
            activity_item=item,
            item_must_be_selectable=item.is_selectable,
            description=description,
            activity_start_date=today - timedelta(days=3),
            activity_end_date=today - timedelta(days=2),
            semester=semester,
            declared_quantity=1,
            validated_quantity=1 if state == 'APPROVED' else 0,
            applied_points_per_unit=item.points_per_unit,
            applied_unit_name=item.unit_name,
            applied_max_points_semester=item.max_points_semester,
            calculated_points=5 if state == 'APPROVED' else 0,
            approved_points=5 if state == 'APPROVED' else 0,
            file_path=file_path,
            file_ext='pdf',
            mime_type='application/pdf',
            file_size_bytes=len(file_bytes),
            file_hash_sha256=hashlib.sha256(file_bytes).hexdigest(),
            status=state,
            evaluator=professor if state != 'PENDING' else None,
            evaluator_role='PROFESSOR' if state != 'PENDING' else None,
            evaluated_at=timezone.now() if state != 'PENDING' else None,
            evaluator_feedback=(
                'Comprovante validado.' if state == 'APPROVED'
                else 'Comprovante ilegível.' if state == 'REJECTED'
                else ''
            ),
        )
