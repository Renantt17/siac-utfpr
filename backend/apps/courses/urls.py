from django.urls import path

from . import views

urlpatterns = [
    path('courses/', views.CourseListCreateView.as_view(), name='course_list_create'),
    path('courses/<int:course_id>/', views.CourseDetailView.as_view(), name='course_detail'),
    path(
        'courses/<int:course_id>/scoring-table/',
        views.CourseScoringTableView.as_view(),
        name='course_scoring_table',
    ),
    path('activity-items/', views.CourseScoringTableView.as_view(), name='activity_catalog'),
    path(
        'courses/<int:course_id>/groups/',
        views.CourseGroupListCreateView.as_view(),
        name='course_group_create',
    ),
    path(
        'courses/<int:course_id>/groups/<int:group_id>/',
        views.CourseGroupDetailView.as_view(),
        name='course_group_detail',
    ),
    path(
        'courses/<int:course_id>/groups/<int:group_id>/items/',
        views.CourseItemCreateView.as_view(),
        name='course_item_create',
    ),
    path(
        'courses/<int:course_id>/items/<int:item_id>/',
        views.CourseItemDetailView.as_view(),
        name='course_item_detail',
    ),
    path(
        'courses/<int:course_id>/analytics/',
        views.CourseAnalyticsView.as_view(),
        name='course_analytics',
    ),
    path(
        'courses/<int:course_id>/enrollments/',
        views.CourseEnrollmentListView.as_view(),
        name='course_enrollments',
    ),
    path('enrollments/me/', views.MyEnrollmentsView.as_view(), name='my_enrollments'),
    path('enrollments/', views.EnrollmentCreateView.as_view(), name='enrollment_create'),
    path(
        'enrollments/<int:enrollment_id>/suspensions/',
        views.EnrollmentSuspensionListCreateView.as_view(),
        name='enrollment_suspensions',
    ),
]
