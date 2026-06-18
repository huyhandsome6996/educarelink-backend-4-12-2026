from django.shortcuts import render, redirect
from django.views.generic import TemplateView
from django.views import View

class SplashView(TemplateView):
    template_name = "frontend/splash.html"

class LoginView(TemplateView):
    template_name = "frontend/login.html"

class RegisterView(TemplateView):
    template_name = "frontend/register.html"

class ParentHomeView(TemplateView):
    template_name = "frontend/parent_home.html"

class TaskCreate1View(TemplateView):
    template_name = "frontend/task_create_1.html"

class TaskCreate2View(TemplateView):
    template_name = "frontend/task_create_2.html"

class ParentTasksView(TemplateView):
    template_name = "frontend/parent_tasks.html"

class BrowseCandidatesView(TemplateView):
    template_name = "frontend/browse_candidates.html"

class ReviewView(TemplateView):
    template_name = "frontend/review.html"

class WorkerFeedView(TemplateView):
    template_name = "frontend/worker_feed.html"

class TaskDetailView(TemplateView):
    template_name = "frontend/task_detail.html"

class WorkerJobsView(TemplateView):
    template_name = "frontend/worker_jobs.html"

class WorkerProfileView(TemplateView):
    template_name = "frontend/worker_profile.html"

class ChatbotView(TemplateView):
    template_name = "frontend/chatbot.html"

class AdminDashboardView(TemplateView):
    template_name = "frontend/admin_dashboard.html"

class ParentOnboardingView(TemplateView):
    template_name = "frontend/onboarding_parent.html"

class WorkerOnboardingView(TemplateView):
    template_name = "frontend/onboarding_worker.html"

class WorkerChatbotView(TemplateView):
    template_name = "frontend/worker_chatbot.html"

class HelpCenterView(TemplateView):
    template_name = "frontend/help_center.html"


class LiveTrackingView(TemplateView):
    """Trang theo dõi vị trí Carepartner real-time (parent)."""
    template_name = "frontend/tracking.html"
