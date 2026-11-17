from django.urls import path
from .views import OpportunityListCreateView

urlpatterns = [
    path('', OpportunityListCreateView.as_view(), name='opportunity_list_create'),
]
