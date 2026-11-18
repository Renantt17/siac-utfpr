from django.urls import path
from . import views

urlpatterns = [
    path('register/', views.RegisterView.as_view(), name='register'),
    path('campuses/', views.CampusListView.as_view(), name='campus_list'),
    path('students/', views.StudentListView.as_view(), name='student_list'),
    path('me/', views.me, name='me'),
]
