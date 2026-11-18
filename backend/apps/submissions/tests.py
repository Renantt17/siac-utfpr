from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import Campus, User, UserRole
from apps.courses.models import ActivityGroup, ActivityItem, Course, Enrollment
from .models import Notification, Submission


class SubmissionFlowApiTests(APITestCase):
    def setUp(self):
        campus = Campus.objects.create(name='Campus Teste', acronym='CT')
        self.student = User.objects.create_user(
            email='aluno@example.com',
            institutional_id='100',
            full_name='Aluno Teste',
            campus=campus,
            password='Senha-Forte-2026!x',
        )
        UserRole.objects.create(user=self.student, role='STUDENT')
        self.professor = User.objects.create_user(
            email='prof@example.com',
            institutional_id='200',
            full_name='Professor Teste',
            campus=campus,
            password='Senha-Forte-2026!x',
        )
        UserRole.objects.create(user=self.professor, role='PROFESSOR')
        course = Course.objects.create(
            campus=campus,
            name='Curso Teste',
            code='CT-01',
            coordinator=self.professor,
            prac_professor=self.professor,
            min_total_points=5,
        )
        self.enrollment = Enrollment.objects.create(
            student=self.student,
            course=course,
            enrollment_date=timezone.localdate(),
            status='ACTIVE',
        )
        group = ActivityGroup.objects.create(
            course=course, group_number=1, title='Eventos', min_points=5
        )
        self.item = ActivityItem.objects.create(
            group=group,
            code='EVT001',
            description='Evento acadêmico',
            points_per_unit=5,
            unit_name='evento',
            max_points_semester=20,
            required_proof_description='Certificado',
        )

    def test_student_submits_and_professor_evaluates(self):
        self.client.force_authenticate(self.student)
        today = timezone.localdate()
        proof = SimpleUploadedFile(
            'comprovante.pdf',
            b'%PDF-1.4\\n1 0 obj<</Type/Catalog>>endobj\\n%%EOF',
            content_type='application/pdf',
        )
        response = self.client.post('/api/submissions/', {
            'enrollment': self.enrollment.pk,
            'activity_item': self.item.pk,
            'description': 'Participação em evento',
            'activity_start_date': today.isoformat(),
            'activity_end_date': today.isoformat(),
            'semester': f'{today.year}-2',
            'declared_quantity': 3,
            'file': proof,
        }, format='multipart')
        self.assertEqual(response.status_code, 201)
        public_id = response.data['public_id']
        submission = Submission.objects.get(public_id=public_id)
        self.assertEqual(submission.status, 'PENDING')

        self.client.force_authenticate(self.professor)
        pending = self.client.get('/api/submissions/pending/')
        self.assertEqual(pending.status_code, 200)
        self.assertEqual(len(pending.data), 1)

        evaluated = self.client.post(
            f'/api/submissions/{public_id}/evaluate/',
            {
                'decision': 'APPROVED',
                'validated_quantity': 3,
                'feedback': 'Atividade validada.',
            },
            format='json',
        )
        self.assertEqual(evaluated.status_code, 200)
        submission.refresh_from_db()
        self.assertEqual(submission.status, 'APPROVED')
        self.assertEqual(str(submission.approved_points), '15.00')
        self.assertEqual(Notification.objects.filter(
            recipient=self.student
        ).count(), 1)

        # Uma segunda submissão no mesmo semestre só recebe o saldo do teto.
        self.client.force_authenticate(self.student)
        second_proof = SimpleUploadedFile(
            'comprovante-2.pdf',
            b'%PDF-1.4\\n1 0 obj<</Type/Catalog>>endobj\\n%%EOF',
            content_type='application/pdf',
        )
        second_response = self.client.post('/api/submissions/', {
            'enrollment': self.enrollment.pk,
            'activity_item': self.item.pk,
            'description': 'Segundo evento acadêmico',
            'activity_start_date': today.isoformat(),
            'activity_end_date': today.isoformat(),
            'semester': f'{today.year}-2',
            'declared_quantity': 3,
            'file': second_proof,
        }, format='multipart')
        self.assertEqual(second_response.status_code, 201)

        self.client.force_authenticate(self.professor)
        second_evaluation = self.client.post(
            f"/api/submissions/{second_response.data['public_id']}/evaluate/",
            {
                'decision': 'APPROVED',
                'validated_quantity': 3,
                'feedback': 'Atividade validada.',
            },
            format='json',
        )
        self.assertEqual(second_evaluation.status_code, 200)
        self.assertEqual(str(second_evaluation.data['approved_points']), '5.00')

        self.client.force_authenticate(self.student)
        history = self.client.get('/api/submissions/')
        self.assertEqual(history.status_code, 200)
        self.assertEqual(history.data[0]['status'], 'APPROVED')
    def test_rejects_file_with_invalid_signature(self):
        self.client.force_authenticate(self.student)
        today = timezone.localdate()
        response = self.client.post('/api/submissions/', {
            'enrollment': self.enrollment.pk,
            'activity_item': self.item.pk,
            'description': 'Arquivo inválido',
            'activity_start_date': today.isoformat(),
            'activity_end_date': today.isoformat(),
            'semester': f'{today.year}-{1 if today.month <= 6 else 2}',
            'declared_quantity': 1,
            'file': SimpleUploadedFile(
                'falso.pdf', b'isto nao e um PDF', content_type='application/pdf'
            ),
        }, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertIn('file', response.data)

    def test_student_cannot_evaluate_submission(self):
        self.client.force_authenticate(self.student)
        today = timezone.localdate()
        response = self.client.post('/api/submissions/', {
            'enrollment': self.enrollment.pk,
            'activity_item': self.item.pk,
            'description': 'Comprovante para teste de permissão',
            'activity_start_date': today.isoformat(),
            'activity_end_date': today.isoformat(),
            'semester': f'{today.year}-{1 if today.month <= 6 else 2}',
            'declared_quantity': 1,
            'file': SimpleUploadedFile(
                'comprovante.pdf',
                b'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF',
                content_type='application/pdf',
            ),
        }, format='multipart')
        self.assertEqual(response.status_code, 201)
        public_id = response.data['public_id']

        denied = self.client.post(
            f'/api/submissions/{public_id}/evaluate/',
            {'decision': 'APPROVED', 'validated_quantity': 1},
            format='json',
        )
        self.assertEqual(denied.status_code, 403)
    def test_evaluation_feedback_has_maximum_length(self):
        self.client.force_authenticate(self.student)
        today = timezone.localdate()
        created = self.client.post('/api/submissions/', {
            'enrollment': self.enrollment.pk,
            'activity_item': self.item.pk,
            'description': 'Submissão para validar feedback',
            'activity_start_date': today.isoformat(),
            'activity_end_date': today.isoformat(),
            'semester': f'{today.year}-{1 if today.month <= 6 else 2}',
            'declared_quantity': 1,
            'file': SimpleUploadedFile(
                'comprovante.pdf',
                b'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF',
                content_type='application/pdf',
            ),
        }, format='multipart')
        self.assertEqual(created.status_code, 201)

        self.client.force_authenticate(self.professor)
        evaluated = self.client.post(
            f"/api/submissions/{created.data['public_id']}/evaluate/",
            {
                'decision': 'REJECTED',
                'validated_quantity': 0,
                'feedback': 'x' * 2001,
            },
            format='json',
        )
        self.assertEqual(evaluated.status_code, 400)
        self.assertIn('feedback', evaluated.data)
