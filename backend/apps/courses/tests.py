from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import Campus, User, UserRole
from .models import ActivityGroup, ActivityItem, Course, Enrollment


class CourseCatalogApiTests(APITestCase):
    def setUp(self):
        self.campus = Campus.objects.create(name='Campus Teste', acronym='CT')
        self.student = User.objects.create_user(
            email='aluno@example.com',
            institutional_id='100',
            full_name='Aluno Teste',
            campus=self.campus,
            password='Senha-Forte-2026!x',
        )
        UserRole.objects.create(user=self.student, role='STUDENT')
        self.professor = User.objects.create_user(
            email='prof@example.com',
            institutional_id='200',
            full_name='Professor Teste',
            campus=self.campus,
            password='Senha-Forte-2026!x',
        )
        UserRole.objects.create(user=self.professor, role='PROFESSOR')
        self.course = Course.objects.create(
            campus=self.campus,
            name='Sistemas de Informação',
            code='SI-CT',
            coordinator=self.professor,
            prac_professor=self.professor,
            min_total_points=200,
        )
        self.enrollment = Enrollment.objects.create(
            student=self.student,
            course=self.course,
            enrollment_date=timezone.localdate(),
            status='ACTIVE',
        )
        self.group = ActivityGroup.objects.create(
            course=self.course,
            group_number=1,
            title='Eventos',
            min_points=20,
        )
        self.item = ActivityItem.objects.create(
            group=self.group,
            code='EVT001',
            description='Participação em eventos',
            points_per_unit=5,
            unit_name='evento',
            max_points_semester=20,
            required_proof_description='Certificado',
        )

    def test_student_can_consult_courses_enrollment_and_catalog(self):
        self.client.force_authenticate(self.student)

        courses = self.client.get('/api/courses/')
        self.assertEqual(courses.status_code, 200)
        self.assertEqual(courses.data[0]['id'], self.course.pk)

        enrollments = self.client.get('/api/enrollments/me/')
        self.assertEqual(enrollments.status_code, 200)
        self.assertEqual(enrollments.data[0]['id'], self.enrollment.pk)

        catalog = self.client.get(
            '/api/activity-items/', {'course_id': self.course.pk}
        )
        self.assertEqual(catalog.status_code, 200)
        self.assertEqual(catalog.data[0]['activities'][0]['id'], self.item.pk)

    def test_student_cannot_create_enrollment(self):
        self.client.force_authenticate(self.student)
        response = self.client.post('/api/enrollments/', {
            'student_id': self.student.pk,
            'course_id': self.course.pk,
            'enrollment_date': timezone.localdate().isoformat(),
            'status': 'ACTIVE',
        }, format='json')
        self.assertEqual(response.status_code, 403)
