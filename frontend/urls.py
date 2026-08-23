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
    path('parent/rewards/', ParentRewardsView.as_view(), name='parent_rewards'),
    path('worker/', WorkerFeedView.as_view(), name='worker_feed'),
    path('worker/task-detail/', TaskDetailView.as_view(), name='task_detail'),
    path('worker/my-jobs/', WorkerJobsView.as_view(), name='worker_jobs'),
    path('worker/profile/', WorkerProfileView.as_view(), name='worker_profile'),
    path('worker/availability/', WorkerAvailabilityView.as_view(), name='worker_availability'),
    path('worker/chatbot/', WorkerChatbotView.as_view(), name='worker_chatbot'),
    path('worker/help-center/', HelpCenterView.as_view(), name='help_center'),
    path('worker/care-diary/', WorkerCareDiaryFormView.as_view(), name='worker_care_diary'),
    path('parent/care-diary/', ParentCareDiaryDetailView.as_view(), name='parent_care_diary_detail'),
    path('parent/care-diary-history/', ParentCareDiaryHistoryView.as_view(), name='parent_care_diary_history'),
    path('parent/tracking/', LiveTrackingView.as_view(), name='live_tracking'),
    path('admin-dashboard/', AdminDashboardView.as_view(), name='admin_dashboard'),
]
