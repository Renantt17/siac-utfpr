from django.urls import path

from . import views

urlpatterns = [
    path('summary/', views.HomologationSummaryView.as_view(), name='homologation_summary'),
    path('candidates/', views.HomologationCandidatesView.as_view(), name='homologation_candidates'),
    path('<int:enrollment_id>/finalize/', views.FinalizeHomologationView.as_view(), name='homologation_finalize'),
    path('<uuid:public_id>/confirm/', views.ConfirmHomologationView.as_view(), name='homologation_confirm'),
    path('<uuid:public_id>/report/', views.HomologationReportView.as_view(), name='homologation_report'),
]
