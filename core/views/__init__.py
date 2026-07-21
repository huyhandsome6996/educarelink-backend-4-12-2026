"""core/views/ package — tách từ core/views.py (2496 dòng) theo domain.

Backward compat: `from core.views import X` vẫn hoạt động nhờ re-export.
Files:
- _helpers.py       — get_tokens_for_user, send_expo_push_notification, etc.
- auth_views.py     — register, login, profile, onboarding, health
- task_views.py     — task CRUD + apply + worker jobs + worker profile
- review_views.py   — review
- profile_views.py  — credential submissions + profile change requests
- admin_views.py    — admin endpoints + user notifications
- chatbot_views.py  — chatbot + help center + distance
"""

# Re-export helper functions
from ._helpers import (
    build_absolute_uri,
    get_tokens_for_user,
    send_expo_push_notification,
    haversine_distance,
    _get_platform_stats,
    _execute_admin_action,
)

# from .auth_views
from .auth_views import (
    HealthCheckAPIView,
    KeepAliveStatsAPIView,
    RegisterAPIView,
    LoginAPIView,
    UserProfileAPIView,
    CompleteOnboardingAPIView,
)

# from .task_views
from .task_views import (
    TaskListCreateAPIView,
    TaskDetailAPIView,
    TaskUpdateStatusAPIView,
    ParentTasksAPIView,
    TaskCandidatesAPIView,
    ApproveCandidateAPIView,
    ApplyTaskAPIView,
    WorkerJobsAPIView,
    WorkerProfileDetailAPIView,
)

# from .review_views
from .review_views import (
    ReviewCreateAPIView,
)

# from .profile_views
from .profile_views import (
    WorkerSubmitCredentialAPIView,
    AdminCredentialSubmissionsAPIView,
    AdminReviewCredentialAPIView,
    WorkerProfileChangeRequestAPIView,
    AdminProfileChangeRequestsAPIView,
    AdminReviewProfileChangeRequestAPIView,
)

# from .admin_views
from .admin_views import (
    AdminPendingWorkersAPIView,
    AdminApproveWorkerAPIView,
    AdminToggleUserActiveAPIView,
    AdminRevokeCarepartnerAPIView,
    AdminAllUsersAPIView,
    AdminAllWorkersAPIView,
    AdminAllTasksAPIView,
    AdminModerateTaskAPIView,
    AdminSeedDemoDataAPIView,
    AdminSendNotificationAPIView,
    UserNotificationsAPIView,
    UnreadNotificationCountAPIView,
    MarkNotificationsReadAPIView,
)

# from .chatbot_views
from .chatbot_views import (
    ChatbotAPIView,
    WorkerChatbotAPIView,
    HelpCenterAPIView,
    DistanceCalculationAPIView,
    AdminChatbotAPIView,
)
