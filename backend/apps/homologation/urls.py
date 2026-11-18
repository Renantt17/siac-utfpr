from django.urls import path
from . import views

urlpatterns = [
    path('summary/', views.HomologationSummaryView.as_view(), name='homologation_summary'),
    path('<int:enrollment_id>/finalize/', views.FinalizeHomologationView.as_view(), name='homologation_finalize'),
    path('<uuid:public_id>/report/', views.HomologationReportView.as_view(), name='homologation_report'),
]
