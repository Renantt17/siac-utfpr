from django.urls import path
from . import views

urlpatterns = [
    path('', views.NotificationListView.as_view(), name='notification_list'),
    path('<uuid:public_id>/read/', views.NotificationReadView.as_view(), name='notification_read'),
]
