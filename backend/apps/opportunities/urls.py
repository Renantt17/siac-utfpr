from django.urls import path

from .views import OpportunityDetailView, OpportunityListCreateView

urlpatterns = [
    path('', OpportunityListCreateView.as_view(), name='opportunity_list_create'),
    path('<uuid:public_id>/', OpportunityDetailView.as_view(), name='opportunity_detail'),
]
