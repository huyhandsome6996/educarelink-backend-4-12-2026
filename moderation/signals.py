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
    Khi task mới được tạo → tự động kiểm duyệt bằng AI.
    ⚡ TỐI ƯU: chạy ASYNC trong background thread — không chặn luồng đăng task.
    Trước: user đợi 10-30s cho AI moderate xong mới nhận response.
    Sau: user nhận response ngay (< 100ms), AI moderate chạy nền + update DB sau.
    """
    if kwargs.get('raw'):
        return
    if not created:
        return
    if instance.status != 'open':
        return

    # Tạo moderation record pending ngay lập tức (để parent biết đang duyệt)
    try:
        from .models import TaskModeration
        TaskModeration.objects.get_or_create(
            task=instance,
            defaults={
                'status': 'pending',
                'ai_verdict': 'Đang kiểm duyệt...',
                'ai_confidence': 0.0,
            }
        )
    except Exception:
        pass

    # ⚡ Chạy AI moderate trong background thread
    def _run_moderation_async():
        try:
            from .services import moderate_task
            moderate_task(instance)
        except Exception as e:
            logger.exception(f"Auto moderate Task#{instance.id} failed: {e}")
            # Fallback: approve nếu AI fail
            try:
                from .models import TaskModeration
                TaskModeration.objects.filter(task=instance, status='pending').update(
                    status='approved',
                    ai_verdict='AI kiểm duyệt thất bại — tự động duyệt.',
                )
            except Exception:
                pass

    threading.Thread(target=_run_moderation_async, daemon=True).start()
    logger.info(f"[moderation.signals] Async moderate started for Task#{instance.id}")
