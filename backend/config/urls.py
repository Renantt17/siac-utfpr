from django.urls import include, path

urlpatterns = [
    path('api/v1/', include('apps.accounts.urls')),
    path('api/v1/', include('apps.courses.urls')),
    path('api/v1/submissions/', include('apps.submissions.urls')),
    path('api/v1/notifications/', include('apps.submissions.notification_urls')),
    path('api/v1/homologation/', include('apps.homologation.urls')),
    path('api/v1/opportunities/', include('apps.opportunities.urls')),
    path('api/v1/audit/', include('apps.audit.urls')),
]
