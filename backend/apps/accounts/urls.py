from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

urlpatterns = [
    path('auth/login/', views.HybridLoginView.as_view(), name='auth_login'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='auth_refresh'),
    path('campuses/', views.CampusListView.as_view(), name='campus_list'),
    path('students/', views.StudentListView.as_view(), name='student_list'),
    path('users/', views.AdminUserListView.as_view(), name='user_list'),
    path('users/<uuid:public_id>/roles/', views.UserRoleManageView.as_view(), name='user_roles'),
    path('me/', views.me, name='me'),
]
