from rest_framework.test import APITestCase

from .models import Campus, User, UserRole


class RegistrationApiTests(APITestCase):
    def setUp(self):
        self.campus = Campus.objects.create(
            name='Campus de Teste', acronym='CT'
        )

    def test_list_active_campuses_and_register_student(self):
        response = self.client.get('/api/campuses/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)

        response = self.client.post('/api/register/', {
            'full_name': 'Estudante de Teste',
            'email': 'estudante@example.com',
            'institutional_id': '123456',
            'campus': self.campus.pk,
            'password': 'Senha-Forte-2026!x',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        user = User.objects.get(email='estudante@example.com')
        self.assertTrue(user.check_password('Senha-Forte-2026!x'))
        self.assertTrue(user.roles.filter(role=User.Role.STUDENT).exists())
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_registration_rejects_duplicate_email(self):
        User.objects.create_user(
            email='duplicado@example.com',
            institutional_id='654321',
            full_name='Usuário Existente',
            campus=self.campus,
            password='Senha-Forte-2026!x',
        )
        response = self.client.post('/api/register/', {
            'full_name': 'Outro Usuário',
            'email': 'duplicado@example.com',
            'institutional_id': '654322',
            'campus': self.campus.pk,
            'password': 'Senha-Forte-2026!x',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.data)
