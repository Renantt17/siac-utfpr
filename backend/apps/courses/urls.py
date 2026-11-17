from django.urls import path
from . import views

urlpatterns = [
    path('courses/', views.CourseListView.as_view(), name='course_list'),
    path('enrollments/me/', views.MyEnrollmentsView.as_view(), name='my_enrollments'),
    path('enrollments/', views.EnrollmentCreateView.as_view(), name='enrollment_create'),
    path('activity-items/', views.ActivityCatalogView.as_view(), name='activity_catalog'),
]
