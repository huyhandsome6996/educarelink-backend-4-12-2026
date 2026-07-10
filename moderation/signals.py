"""Signal handlers — tự động kiểm duyệt task khi parent đăng."""
import logging
import threading
from django.db.models.signals import post_save
from django.dispatch import receiver
from core.models import Task

logger = logging.getLogger('educarelink.moderation.signals')


@receiver(post_save, sender=Task)
def _auto_moderate_task_on_create(sender, instance: Task, created: bool, **kwargs):
    """
    Khi task mới được tạo → AI kiểm duyệt ASYNC trong tối đa 60 giây.
    Nếu AI REJECTED → XÓA task tự động + notify parent.

    User không phải đợi — task tạo thành công ngay lập tức.
    Trong vòng 60 giây, AI sẽ quét xong:
      - Nếu APPROVED → task vẫn hiển thị bình thường
      - Nếu REJECTED → task bị XÓA khỏi hệ thống + parent nhận thông báo
      - Nếu NEEDS_REVIEW → task vẫn hiển thị, admin xem lại sau
    """
    if kwargs.get('raw'):
        return
    if not created:
        return
    if instance.status != 'open':
        return

    # Tạo moderation record pending ngay lập tức
    try:
        from .models import TaskModeration
        TaskModeration.objects.get_or_create(
            task=instance,
            defaults={
                'status': 'pending',
                'ai_verdict': 'Đang kiểm duyệt AI... (tối đa 60 giây)',
                'ai_confidence': 0.0,
            }
        )
    except Exception:
        pass

    # Chạy AI moderate trong background thread
    def _run_moderation_async():
        try:
            from .services import moderate_task
            moderation = moderate_task(instance)

            # ⚡ Nếu AI REJECTED → XÓA task tự động
            if moderation.status == 'rejected':
                try:
                    from core.models import Notification, User
                    from core.views import send_expo_push_notification

                    task_title = instance.title
                    task_id = instance.id
                    parent = instance.parent
                    reason = moderation.ai_verdict[:300] if moderation.ai_verdict else 'Vi phạm tiêu chuẩn cộng đồng'

                    # Notify parent: task bị xóa
                    Notification.objects.create(
                        recipient=parent,
                        title="🚫 Công việc đã bị xóa",
                        message=f'Công việc "{task_title}" đã bị AI xóa vì: {reason[:150]}. Vui lòng đăng lại nội dung phù hợp.',
                    )
                    if parent.expo_push_token:
                        send_expo_push_notification(
                            token=parent.expo_push_token,
                            title="🚫 Công việc bị xóa",
                            body=f'"{task_title}" bị AI xóa: {reason[:100]}',
                            data={'type': 'task_rejected', 'task_id': task_id}
                        )

                    # XÓA task khỏi database
                    instance.delete()
                    logger.info(f"[moderation] Task#{task_id} '{task_title}' DELETED by AI moderation (rejected)")

                except Exception as e:
                    logger.exception(f"[moderation] Failed to delete rejected task: {e}")

            elif moderation.status == 'approved':
                logger.info(f"[moderation] Task#{instance.id} APPROVED by AI")
            elif moderation.status == 'needs_review':
                logger.info(f"[moderation] Task#{instance.id} NEEDS_REVIEW by AI")

        except Exception as e:
            logger.exception(f"Auto moderate Task#{instance.id} failed: {e}")
            # Fallback: approve nếu AI fail (không xóa task vô cớ)
            try:
                from .models import TaskModeration
                TaskModeration.objects.filter(task=instance, status='pending').update(
                    status='approved',
                    ai_verdict='AI kiểm duyệt thất bại — tự động duyệt.',
                )
            except Exception:
                pass

    threading.Thread(target=_run_moderation_async, daemon=True).start()
    logger.info(f"[moderation.signals] Async AI moderation started for Task#{instance.id} (max 60s)")
