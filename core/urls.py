from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    HealthCheckAPIView,
    RegisterAPIView, LoginAPIView, UserProfileAPIView,
    TaskListCreateAPIView, TaskDetailAPIView, TaskUpdateStatusAPIView, ParentTasksAPIView, TaskCandidatesAPIView, 
    ApproveCandidateAPIView, ReviewCreateAPIView,
    ApplyTaskAPIView, WorkerJobsAPIView, WorkerProfileDetailAPIView,
    ChatbotAPIView,
    AdminPendingWorkersAPIView, AdminApproveWorkerAPIView, AdminAllWorkersAPIView,
    AdminToggleUserActiveAPIView, AdminRevokeCarepartnerAPIView, AdminAllUsersAPIView,
    AdminSeedDemoDataAPIView,
    CompleteOnboardingAPIView,
    WorkerSubmitCredentialAPIView,
    AdminCredentialSubmissionsAPIView, AdminReviewCredentialAPIView,
    AdminSendNotificationAPIView,
    UserNotificationsAPIView, UnreadNotificationCountAPIView, MarkNotificationsReadAPIView,
    WorkerProfileChangeRequestAPIView, AdminProfileChangeRequestsAPIView, AdminReviewProfileChangeRequestAPIView,
    WorkerChatbotAPIView, HelpCenterAPIView,
    DistanceCalculationAPIView,
    AdminChatbotAPIView,
)

urlpatterns = [
    # Health Check (cho keep-alive ping)
    path('health/', HealthCheckAPIView.as_view(), name='health-check'),

    # Màn hình Chung (Auth & Profile)
    path('auth/register/', RegisterAPIView.as_view(), name='register'),
    path('auth/login/', LoginAPIView.as_view(), name='login'),
    path('profile/', UserProfileAPIView.as_view(), name='profile'),
    
    # Bảng tin chung (Cho sinh viên tìm việc / Phụ huynh đăng việc)
    path('tasks/', TaskListCreateAPIView.as_view(), name='task-list-create'),
    path('tasks/<int:pk>/', TaskDetailAPIView.as_view(), name='task-detail'),
    path('tasks/<int:pk>/status/', TaskUpdateStatusAPIView.as_view(), name='task-update-status'),
    
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
    path('admin/users/<int:user_id>/toggle-active/', AdminToggleUserActiveAPIView.as_view(), name='admin-toggle-user-active'),
    path('admin/users/<int:user_id>/revoke-carepartner/', AdminRevokeCarepartnerAPIView.as_view(), name='admin-revoke-carepartner'),
    path('admin/all-users/', AdminAllUsersAPIView.as_view(), name='admin-all-users'),
    path('admin/seed-demo-data/', AdminSeedDemoDataAPIView.as_view(), name='admin-seed-demo-data'),
    path('onboarding/complete/', CompleteOnboardingAPIView.as_view(), name='complete-onboarding'),
    
    # Carepartner gửi bằng cấp cho Admin duyệt
    path('worker/submit-credential/', WorkerSubmitCredentialAPIView.as_view(), name='worker-submit-credential'),
    
    # Admin duyệt bằng cấp + gửi thông báo
    path('admin/credential-submissions/', AdminCredentialSubmissionsAPIView.as_view(), name='admin-credential-submissions'),
    path('admin/credential-submissions/<int:submission_id>/review/', AdminReviewCredentialAPIView.as_view(), name='admin-review-credential'),
    path('admin/send-notification/', AdminSendNotificationAPIView.as_view(), name='admin-send-notification'),
    
    # Thông báo cho người dùng
    path('notifications/', UserNotificationsAPIView.as_view(), name='user-notifications'),
    path('notifications/unread-count/', UnreadNotificationCountAPIView.as_view(), name='unread-notification-count'),
    path('notifications/mark-read/', MarkNotificationsReadAPIView.as_view(), name='mark-notifications-read'),
    
    # Yêu cầu thay đổi hồ sơ (Carepartner gửi, Admin duyệt)
    path('worker/profile-change-request/', WorkerProfileChangeRequestAPIView.as_view(), name='worker-profile-change-request'),
    path('admin/profile-change-requests/', AdminProfileChangeRequestsAPIView.as_view(), name='admin-profile-change-requests'),
    path('admin/profile-change-requests/<int:request_id>/review/', AdminReviewProfileChangeRequestAPIView.as_view(), name='admin-review-profile-change'),
    
    # AI Chatbot cho Carepartner
    path('worker/chatbot/', WorkerChatbotAPIView.as_view(), name='worker-chatbot'),
    
    # Trung tâm trợ giúp AI
    path('help-center/', HelpCenterAPIView.as_view(), name='help-center'),

    # Tính khoảng cách (Haversine + Gemini AI)
    path('distance/', DistanceCalculationAPIView.as_view(), name='distance-calculation'),

    # AI Chatbot cho Admin (thống kê, hành động, phân tích ảnh)
    path('admin/chatbot/', AdminChatbotAPIView.as_view(), name='admin-chatbot'),
]