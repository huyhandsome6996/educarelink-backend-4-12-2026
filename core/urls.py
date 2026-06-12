from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    RegisterAPIView, LoginAPIView, UserProfileAPIView,
    TaskListCreateAPIView, TaskDetailAPIView, ParentTasksAPIView, TaskCandidatesAPIView, 
    ApproveCandidateAPIView, ReviewCreateAPIView,
    ApplyTaskAPIView, WorkerJobsAPIView, WorkerProfileDetailAPIView,
    ChatbotAPIView,
    AdminPendingWorkersAPIView, AdminApproveWorkerAPIView, AdminAllWorkersAPIView,
)

urlpatterns = [
    # Màn hình Chung (Auth & Profile)
    path('auth/register/', RegisterAPIView.as_view(), name='register'),
    path('auth/login/', LoginAPIView.as_view(), name='login'),
    path('profile/', UserProfileAPIView.as_view(), name='profile'),
    
    # Bảng tin chung (Cho sinh viên tìm việc / Phụ huynh đăng việc)
    path('tasks/', TaskListCreateAPIView.as_view(), name='task-list-create'),
    path('tasks/<int:pk>/', TaskDetailAPIView.as_view(), name='task-detail'),
    
    # Token refresh — cho phép cả web và mobile refresh access token
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # API riêng cho Luồng Phụ huynh (Parent)
    path('parent/my-tasks/', ParentTasksAPIView.as_view(), name='parent-tasks'),
    path('parent/tasks/<int:task_id>/candidates/', TaskCandidatesAPIView.as_view(), name='task-candidates'),
    path('parent/applications/<int:application_id>/approve/', ApproveCandidateAPIView.as_view(), name='approve-candidate'),
    path('parent/review/', ReviewCreateAPIView.as_view(), name='create-review'),
    
    # API riêng cho Luồng Sinh viên (Worker)
    path('worker/tasks/<int:task_id>/apply/', ApplyTaskAPIView.as_view(), name='apply-task'),
    path('worker/my-jobs/', WorkerJobsAPIView.as_view(), name='worker-jobs'),
    path('worker/<int:worker_id>/profile/', WorkerProfileDetailAPIView.as_view(), name='worker-profile-detail'),
    
    # AI Chatbot
    path('chatbot/', ChatbotAPIView.as_view(), name='chatbot'),
    
    # Admin quản lý duyệt tài khoản Carepartner
    path('admin/pending-workers/', AdminPendingWorkersAPIView.as_view(), name='admin-pending-workers'),
    path('admin/workers/<int:user_id>/action/', AdminApproveWorkerAPIView.as_view(), name='admin-approve-worker'),
    path('admin/all-workers/', AdminAllWorkersAPIView.as_view(), name='admin-all-workers'),
]