from django.urls import path
from .views import *

app_name = 'frontend'

urlpatterns = [
    path('site-gate/', SiteGateView.as_view(), name='site_gate'),
    path('', SplashView.as_view(), name='splash'),
    path('login/', LoginView.as_view(), name='login'),
    path('register/', RegisterView.as_view(), name='register'),
    path('onboarding/parent/', ParentOnboardingView.as_view(), name='parent_onboarding'),
    path('onboarding/worker/', WorkerOnboardingView.as_view(), name='worker_onboarding'),
    path('parent/', ParentHomeView.as_view(), name='parent_home'),
    path('parent/create-1/', TaskCreate1View.as_view(), name='task_create_1'),
    path('parent/create-2/', TaskCreate2View.as_view(), name='task_create_2'),
    path('parent/tasks/', ParentTasksView.as_view(), name='parent_tasks'),
    path('parent/browse-candidates/', BrowseCandidatesView.as_view(), name='browse_candidates'),
    path('parent/chatbot/', ChatbotView.as_view(), name='chatbot'),
    path('parent/review/', ReviewView.as_view(), name='review'),
    path('worker/', WorkerFeedView.as_view(), name='worker_feed'),
    path('worker/task-detail/', TaskDetailView.as_view(), name='task_detail'),
    path('worker/my-jobs/', WorkerJobsView.as_view(), name='worker_jobs'),
    path('worker/profile/', WorkerProfileView.as_view(), name='worker_profile'),
    path('worker/availability/', WorkerAvailabilityView.as_view(), name='worker_availability'),
    path('worker/chatbot/', WorkerChatbotView.as_view(), name='worker_chatbot'),
    path('worker/help-center/', HelpCenterView.as_view(), name='help_center'),
    path('worker/care-diary/', WorkerCareDiaryFormView.as_view(), name='worker_care_diary'),
    path('parent/profile/', ParentProfileView.as_view(), name='parent_profile'),
    path('parent/care-diary/', ParentCareDiaryDetailView.as_view(), name='parent_care_diary_detail'),
    path('parent/care-diary-history/', ParentCareDiaryHistoryView.as_view(), name='parent_care_diary_history'),
    path('parent/tracking/', LiveTrackingView.as_view(), name='live_tracking'),
    # N — Cửa sổ chat Parent ↔ CarePartner (dùng chung cả 2 role)
    path('chat/', ChatView.as_view(), name='chat'),
    # Parity web ↔ mobile — trang thông báo (mọi role)
    path('notifications/', NotificationsView.as_view(), name='notifications'),
    # Parity web ↔ mobile — khiếu nại CarePartner
    path('worker/complaints/', WorkerComplaintsView.as_view(), name='worker_complaints'),
    # Parity web ↔ mobile — thanh toán phụ huynh + thu nhập CarePartner
    path('parent/payments/', ParentPaymentsView.as_view(), name='parent_payments'),
    path('worker/earnings/', WorkerEarningsView.as_view(), name='worker_earnings'),
    path('admin-dashboard/', AdminDashboardView.as_view(), name='admin_dashboard'),
    # Landing page công khai (khảo sát + đăng ký tư vấn/dùng thử)
    path('landing/', LandingPageView.as_view(), name='landing_page'),
]
