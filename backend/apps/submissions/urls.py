from django.urls import path
from . import views

urlpatterns = [
    path('', views.submission_list, name='submission_list'),

    path(
        'pending/',
        views.pending_submissions,
        name='pending_submissions'
    ),

    path(
        '<uuid:public_id>/evaluate/',
        views.evaluate_submission,
        name='evaluate_submission'
    ),
]