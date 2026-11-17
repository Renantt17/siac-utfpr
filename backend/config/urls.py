from django.contrib import admin
from django.urls import include, path

from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/', include('apps.accounts.urls')),
    path('api/', include('apps.courses.urls')),
    path('api/submissions/', include('apps.submissions.urls')),
    path('api/notifications/', include('apps.submissions.notification_urls')),
    path('api/homologation/', include('apps.homologation.urls')),
    path('api/opportunities/', include('apps.opportunities.urls')),
]
