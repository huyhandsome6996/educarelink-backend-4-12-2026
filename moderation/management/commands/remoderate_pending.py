"""
Management command: re-moderate tất cả task có moderation status='pending'.

Sử dụng khi:
- Deploy code mới với prompt cải thiện
- Moderation bị stuck pending do thread fail
- Muốn cleanup data cũ

Usage:
    python manage.py remoderate_pending
"""
from django.core.management.base import BaseCommand
from moderation.models import TaskModeration
from moderation.services import moderate_task
from core.models import Task


class Command(BaseCommand):
    help = 'Re-moderate tất cả task có moderation status=pending (sync, không dùng thread)'

    def handle(self, *args, **options):
        pending = TaskModeration.objects.filter(status='pending').select_related('task')
        count = pending.count()
        self.stdout.write(self.style.WARNING(f'Tìm thấy {count} task pending moderation'))

        deleted_count = 0
        approved_count = 0
        rejected_count = 0
        needs_review_count = 0
        error_count = 0

        for mod in pending:
            task = mod.task
            try:
                # Re-run moderate_task (sync)
                result = moderate_task(task)
                if result.status == 'rejected':
                    # Task đã bị xóa trong moderate_task? Không — moderate_task chỉ set status, không xóa.
                    # Phải xóa thủ công như signals
                    try:
                        from core.models import Notification
                        from core.views import send_expo_push_notification
                        parent = task.parent
                        reason = result.ai_verdict[:300] if result.ai_verdict else 'Vi phạm tiêu chuẩn cộng đồng'
                        Notification.objects.create(
                            recipient=parent,
                            title="🚫 Công việc đã bị xóa",
                            message=f'Công việc "{task.title}" đã bị AI xóa vì: {reason[:150]}. Vui lòng đăng lại nội dung phù hợp.',
                        )
                        if parent.expo_push_token:
                            send_expo_push_notification(
                                token=parent.expo_push_token,
                                title="🚫 Công việc bị xóa",
                                body=f'"{task.title}" bị AI xóa: {reason[:100]}',
                                data={'type': 'task_rejected', 'task_id': task.id}
                            )
                        task.delete()
                        deleted_count += 1
                        self.stdout.write(f'  ❌ DELETED Task#{task.id} "{task.title[:40]}" — {reason[:60]}')
                    except Exception as e:
                        self.stderr.write(f'  ⚠️ Failed to delete task #{task.id}: {e}')
                        rejected_count += 1
                elif result.status == 'approved':
                    approved_count += 1
                    self.stdout.write(f'  ✅ APPROVED Task#{task.id} "{task.title[:40]}"')
                elif result.status == 'needs_review':
                    needs_review_count += 1
                    self.stdout.write(f'  ⚠️ NEEDS_REVIEW Task#{task.id} "{task.title[:40]}"')
            except Exception as e:
                error_count += 1
                self.stderr.write(f'  ❌ ERROR Task#{task.id}: {e}')

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=' * 60))
        self.stdout.write(self.style.SUCCESS(f'Re-moderation hoàn tất!'))
        self.stdout.write(f'  Total pending:    {count}')
        self.stdout.write(f'  Deleted (reject): {deleted_count}')
        self.stdout.write(f'  Approved:         {approved_count}')
        self.stdout.write(f'  Rejected (keep):  {rejected_count}')
        self.stdout.write(f'  Needs review:     {needs_review_count}')
        self.stdout.write(f'  Errors:           {error_count}')
