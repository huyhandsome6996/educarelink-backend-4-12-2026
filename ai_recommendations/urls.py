"""URL routing cho ai_recommendations module."""

from django.urls import path
from .views import (
    WorkerRecommendationsAPIView,
    CandidateRecommendationsAPIView,
    ClearRecommendationsCacheAPIView,
)

urlpatterns = [
    path('ai/recommendations/worker/', WorkerRecommendationsAPIView.as_view(), name='ai-worker-recommendations'),
    path('ai/recommendations/candidates/<int:task_id>/', CandidateRecommendationsAPIView.as_view(), name='ai-candidate-recommendations'),
    path('ai/recommendations/clear-cache/', ClearRecommendationsCacheAPIView.as_view(), name='ai-clear-cache'),
]
