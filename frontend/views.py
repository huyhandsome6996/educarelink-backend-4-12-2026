from django.shortcuts import render, redirect
from django.views.generic import TemplateView
from django.views import View
from core.middleware import SiteAccessGateMiddleware


class SiteGateView(View):
    """Trang nhập mật khẩu bảo vệ toàn site (frontend + admin)."""

    def get(self, request):
        return render(request, "frontend/site_gate.html")

    def post(self, request):
        password = request.POST.get("password", "")
        if password == SiteAccessGateMiddleware.get_gate_password():
            request.session[SiteAccessGateMiddleware.SESSION_KEY] = True
            next_url = request.GET.get("next") or "/"
            return redirect(next_url)
        return render(request, "frontend/site_gate.html", {"error": True})


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

class WorkerAvailabilityView(TemplateView):
    template_name = "frontend/worker_availability.html"


class WorkerChatbotView(TemplateView):
    template_name = "frontend/worker_chatbot.html"

class HelpCenterView(TemplateView):
    template_name = "frontend/help_center.html"


class LiveTrackingView(TemplateView):
    """Trang theo dõi vị trí Carepartner real-time (parent)."""
    template_name = "frontend/tracking.html"


class WorkerCareDiaryFormView(TemplateView):
    """Trang ghi/sửa nhật ký chăm sóc (CarePartner web)."""
    template_name = "frontend/worker_care_diary_form.html"


class ParentProfileView(TemplateView):
    template_name = "frontend/parent_profile.html"


class ParentCareDiaryDetailView(TemplateView):
    """Trang xem chi tiết nhật ký (Phụ huynh web)."""
    template_name = "frontend/parent_care_diary_detail.html"


class ParentCareDiaryHistoryView(TemplateView):
    """Trang lịch sử nhật ký (Phụ huynh web)."""
    template_name = "frontend/parent_care_diary_history.html"


class ChatView(TemplateView):
    """N — Trang chat Parent ↔ CarePartner (cửa sổ còn hiệu lực).

    Dùng chung cho cả parent lẫn worker — role phân biệt bằng JWT trong
    localStorage (pattern authFetch), API tự check ownership.
    Query param: ?task_id=<id>
    """
    template_name = "frontend/chat.html"


class NotificationsView(TemplateView):
    """Trang thông báo (parity web ↔ mobile NotificationsScreen).
    Dùng chung mọi role — API tự lọc theo JWT."""
    template_name = "frontend/notifications.html"


class WorkerComplaintsView(TemplateView):
    """Trang khiếu nại của CarePartner (gửi + xem — parity mobile
    ComplaintScreen + MyComplaintsScreen)."""
    template_name = "frontend/worker_complaints.html"


class ParentPaymentsView(TemplateView):
    """Trang thanh toán của phụ huynh (setup MoMo/PayOS/tiền mặt +
    lịch sử — parity mobile PaymentSetupScreen + MyPayments)."""
    template_name = "frontend/parent_payments.html"


class WorkerEarningsView(TemplateView):
    """Trang thu nhập CarePartner (earnings + kỳ hoa hồng QR —
    parity mobile MyEarningsScreen + SettlementDetailScreen)."""
    template_name = "frontend/worker_earnings.html"
