from django.urls import path
from . import views

urlpatterns = [
    path('', views.SubmissionListCreateView.as_view(), name='submission_list'),
    path('pending/', views.PendingSubmissionListView.as_view(), name='pending_submissions'),
    path('<uuid:public_id>/evaluate/', views.EvaluateSubmissionView.as_view(), name='evaluate_submission'),
    path('<uuid:public_id>/file/', views.SubmissionFileView.as_view(), name='submission_file'),
]
