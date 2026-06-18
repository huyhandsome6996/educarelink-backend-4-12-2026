"""URL routing cho moderation module."""
from django.urls import path
from .views import (
    TaskModerationStatusAPIView,
    CreateComplaintAPIView, MyComplaintsAPIView,
    AdminModerationListAPIView, AdminOverrideModerationAPIView,
    AdminComplaintListAPIView, AdminResolveComplaintAPIView,
    AdminAIAnalyzeComplaintAPIView, AdminReModerateTaskAPIView,
    ModerationHealthCheckAPIView,
)

urlpatterns = [
    path('moderation/health/', ModerationHealthCheckAPIView.as_view(), name='moderation-health'),

    # Task moderation status (parent + worker)
    path('moderation/task/<int:task_id>/', TaskModerationStatusAPIView.as_view(), name='moderation-task-status'),

    # Complaints (carepartner)
    path('moderation/complaints/', CreateComplaintAPIView.as_view(), name='create-complaint'),
    path('moderation/complaints/mine/', MyComplaintsAPIView.as_view(), name='my-complaints'),

    # Admin — task moderation
    path('moderation/admin/tasks/', AdminModerationListAPIView.as_view(), name='admin-moderation-list'),
    path('moderation/admin/tasks/<int:pk>/override/', AdminOverrideModerationAPIView.as_view(), name='admin-override-moderation'),
    path('moderation/admin/tasks/<int:task_id>/re-moderate/', AdminReModerateTaskAPIView.as_view(), name='admin-re-moderate'),

    # Admin — complaints
    path('moderation/admin/complaints/', AdminComplaintListAPIView.as_view(), name='admin-complaint-list'),
    path('moderation/admin/complaints/<int:pk>/resolve/', AdminResolveComplaintAPIView.as_view(), name='admin-resolve-complaint'),
    path('moderation/admin/complaints/<int:pk>/ai-analyze/', AdminAIAnalyzeComplaintAPIView.as_view(), name='admin-ai-analyze'),
]
