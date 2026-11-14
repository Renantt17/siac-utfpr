from django.urls import path
from . import views

urlpatterns = [
    path('summary/', views.homologation_summary, name='homologation_summary'),
]