from django.urls import path
from .views import (
    RegisterAPIView, LoginAPIView, 
    TaskListCreateAPIView, ApplyTaskAPIView,
    ChatbotAPIView
)

urlpatterns = [
    # Auth
    path('register/', RegisterAPIView.as_view(), name='api_register'),
    path('login/', LoginAPIView.as_view(), name='api_login'),
    
    # Task
    path('tasks/', TaskListCreateAPIView.as_view(), name='api_tasks'),
    path('tasks/<int:task_id>/apply/', ApplyTaskAPIView.as_view(), name='api_apply_task'),
    
    # Chatbot AI
    path('chatbot/', ChatbotAPIView.as_view(), name='api_chatbot'),
]