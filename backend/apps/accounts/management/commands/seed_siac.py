from datetime import timedelta
from decimal import Decimal
from io import BytesIO

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from reportlab.pdfgen import canvas

from apps.accounts.context import set_db_audit_context
from apps.accounts.models import Campus, User
from apps.courses.models import ActivityItem, Course, Enrollment, EnrollmentSuspension
from apps.courses.services import populate_default_scoring_table
from apps.opportunities.models import Opportunity
from apps.submissions.services import create_submission, evaluate_submission


class Command(BaseCommand):
    help = 'Popula o banco SIAC-UTFPR com campi, usuários pré-cadastrados, Tabela Padrão e exemplos.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--password',
            required=True,
            help='Senha inicial para as contas pré-cadastradas de demonstração.',
        )
        parser.add_argument(
            '--allow-prod',
            action='store_true',
            help='Permite executar mesmo com DEBUG=False em ambiente local.',
        )

    def handle(self, *args, **options):
        if not settings.DEBUG and not options['allow_prod']:
            raise CommandError('Use --allow-prod ou DEBUG=True para executar o seed_siac.')

        password = options['password']

        with transaction.atomic():
            dv, _ = Campus.objects.get_or_create(
                acronym='DV',
                defaults={'name': 'Campus Dois Vizinhos', 'is_active': True},
            )
            cm, _ = Campus.objects.get_or_create(
                acronym='CM',
                defaults={'name': 'Campus Campo Mourão', 'is_active': True},
            )
            Campus.objects.get_or_create(
                acronym='CT',
                defaults={'name': 'Campus Curitiba', 'is_active': True},
            )
            Campus.objects.get_or_create(
                acronym='PG',
                defaults={'name': 'Campus Ponta Grossa', 'is_active': True},
            )

            siac_coord = self._ensure_user(
                email='siac.coord@utfpr.edu.br',
                institutional_id='SIAC0001',
                full_name='Coordenação Geral SIAC-UTFPR',
                campus=dv,
                primary_role='SIAC_COORD',
                password=password,
            )
            course_coord = self._ensure_user(
                email='coord.bes.dv@utfpr.edu.br',
                institutional_id='COORD001',
                full_name='Prof. Coordenador de Curso',
                campus=dv,
                primary_role='COURSE_COORD',
                password=password,
            )
            prac_prof = self._ensure_user(
                email='prac.bes.dv@utfpr.edu.br',
                institutional_id='PRAC0001',
                full_name='Prof. Responsável PRAC',
                campus=dv,
                primary_role='PROFESSOR',
                password=password,
            )
            student = self._ensure_user(
                email='estudante@alunos.utfpr.edu.br',
                institutional_id='a2500001',
                full_name='Estudante de Demonstração',
                campus=dv,
                primary_role='STUDENT',
                password=password,
            )

            set_db_audit_context(siac_coord.id, '127.0.0.1')

            course, created = Course.objects.get_or_create(
                campus=dv,
                code='BES-DV',
                defaults={
                    'name': 'Bacharelado em Engenharia de Software',
                    'coordinator': course_coord,
                    'prac_professor': prac_prof,
                    'min_total_points': Decimal('70.00'),
                    'is_active': True,
                },
            )
            if created or not course.activity_groups.exists():
                populate_default_scoring_table(course)

            today = timezone.localdate()
            enrollment_date = today - timedelta(days=365)
            enrollment, _ = Enrollment.objects.get_or_create(
                student=student,
                course=course,
                defaults={'enrollment_date': enrollment_date, 'status': 'ACTIVE'},
            )

            if not enrollment.suspensions.exists():
                EnrollmentSuspension.objects.create(
                    enrollment=enrollment,
                    start_date=today - timedelta(days=250),
                    end_date=today - timedelta(days=200),
                    reason='Trancamento demonstrativo de exemplo',
                )

            if not enrollment.submissions.exists():
                item_g1 = ActivityItem.objects.filter(
                    group__course=course, group__group_number=1, code='i'
                ).first()
                item_g2 = ActivityItem.objects.filter(
                    group__course=course, group__group_number=2, code='i'
                ).first()
                item_g3 = ActivityItem.objects.filter(
                    group__course=course, group__group_number=3, code='ii.b'
                ).first()

                if item_g1 and item_g2 and item_g3:
                    sub1 = create_submission(
                        actor=student,
                        validated_data={
                            'enrollment': enrollment,
                            'activity_item': item_g1,
                            'description': 'Participação nos Jogos Universitários UTFPR',
                            'activity_start_date': today - timedelta(days=30),
                            'activity_end_date': today - timedelta(days=25),
                            'declared_quantity': Decimal('1'),
                            'file': self._pdf_file('seed_g1.pdf', 'Comprovante Esportivo G1'),
                        },
                        client_ip='127.0.0.1',
                    )
                    evaluate_submission(
                        actor=prac_prof,
                        public_id=sub1.public_id,
                        payload={
                            'decision': 'APPROVED',
                            'feedback': 'Documentação validada conforme tabela.',
                        },
                        client_ip='127.0.0.1',
                    )

                    sub2 = create_submission(
                        actor=student,
                        validated_data={
                            'enrollment': enrollment,
                            'activity_item': item_g2,
                            'description': 'Diretório Acadêmico de Engenharia de Software',
                            'activity_start_date': today - timedelta(days=20),
                            'activity_end_date': today - timedelta(days=15),
                            'declared_quantity': Decimal('1'),
                            'file': self._pdf_file('seed_g2.pdf', 'Comprovante Centro Acadêmico G2'),
                        },
                        client_ip='127.0.0.1',
                    )
                    evaluate_submission(
                        actor=prac_prof,
                        public_id=sub2.public_id,
                        payload={
                            'decision': 'CORRECTION_REQUESTED',
                            'feedback': 'Anexe a ata assinada com o período completo de gestão.',
                        },
                        client_ip='127.0.0.1',
                    )

                    create_submission(
                        actor=student,
                        validated_data={
                            'enrollment': enrollment,
                            'activity_item': item_g3,
                            'description': 'Congresso Internacional de Engenharia de Software',
                            'activity_start_date': today - timedelta(days=10),
                            'activity_end_date': today - timedelta(days=8),
                            'declared_quantity': Decimal('1'),
                            'file': self._pdf_file('seed_g3.pdf', 'Comprovante Congresso Internacional'),
                        },
                        client_ip='127.0.0.1',
                    )

            if not Opportunity.objects.exists():
                Opportunity.objects.create(
                    title='Semana Acadêmica de Engenharia de Software (SEAES)',
                    description='Palestras e minicursos presenciais no Campus Dois Vizinhos.',
                    campus=dv,
                    suggested_group_number=3,
                    suggested_item_code='ii.d',
                    start_date=today + timedelta(days=5),
                    end_date=today + timedelta(days=9),
                    estimated_hours=Decimal('20.00'),
                    modality='PRESENCIAL',
                    is_external=False,
                    organizer_name='COENS-DV / UTFPR',
                    certification_rules='Certificado emitido após 75% de presença.',
                    created_by=siac_coord,
                )
                Opportunity.objects.create(
                    title='Curso Aberto Linux Foundation: Kubernetes e Containers',
                    description='Formação remota internacional sobre nuvem e containers.',
                    campus=None,
                    suggested_group_number=3,
                    suggested_item_code='i',
                    start_date=today,
                    end_date=today + timedelta(days=60),
                    estimated_hours=Decimal('24.00'),
                    modality='REMOTO',
                    is_external=True,
                    organizer_name='The Linux Foundation',
                    certification_rules='Evento externo: a UTFPR realiza apenas a convalidação via certificado verificável.',
                    created_by=siac_coord,
                )
                Opportunity.objects.create(
                    title='Workshop de Ciência de Dados — Campus Campo Mourão',
                    description='Evento técnico aberto a estudantes de outros campi.',
                    campus=cm,
                    suggested_group_number=3,
                    suggested_item_code='ii.a',
                    start_date=today + timedelta(days=12),
                    end_date=today + timedelta(days=13),
                    estimated_hours=Decimal('8.00'),
                    modality='HIBRIDO',
                    is_external=False,
                    organizer_name='DACOM / UTFPR-CM',
                    certification_rules='Certificado digital emitido pela comissão.',
                    created_by=siac_coord,
                )

        self.stdout.write(self.style.SUCCESS('Seed completo SIAC-UTFPR aplicado com sucesso.'))
        self.stdout.write('Contas disponíveis (login por RA/identificador ou e-mail):')
        self.stdout.write('  - Estudante: a2500001 / estudante@alunos.utfpr.edu.br')
        self.stdout.write('  - PRAC: PRAC0001 / prac.bes.dv@utfpr.edu.br')
        self.stdout.write('  - Coord. Curso: COORD001 / coord.bes.dv@utfpr.edu.br')
        self.stdout.write('  - Coord. SIAC: SIAC0001 / siac.coord@utfpr.edu.br')

    @staticmethod
    def _ensure_user(*, email, institutional_id, full_name, campus, primary_role, password):
        user = User.objects.filter(email=email).first()
        if user:
            return user
        return User.objects.create_user(
            email=email,
            institutional_id=institutional_id,
            full_name=full_name,
            campus=campus,
            primary_role=primary_role,
            password=password,
        )

    @staticmethod
    def _pdf_file(filename: str, text: str) -> SimpleUploadedFile:
        buf = BytesIO()
        c = canvas.Canvas(buf)
        c.drawString(72, 760, f'SIAC-UTFPR | {text}')
        c.save()
        return SimpleUploadedFile(filename, buf.getvalue(), content_type='application/pdf')
