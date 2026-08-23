"""
Service layer cho chat module (N — Cửa sổ chat còn hiệu lực).
Tách logic nghiệp vụ khỏi views (AGENTS.md §15.3).

Quyết định thiết kế (chi tiết + lý do trong WORKLOG "## N — Cửa sổ chat"):
  (A) Cửa sổ mở khi task.status → 'in_progress' (Lựa chọn 1 — tái dùng state
      machine sẵn có, nhất quán với cách tracking/B5 coi in_progress là
      "đang trong ca"). Toàn bộ việc mở đi qua 1 hàm duy nhất
      open_conversation_for_task() → đổi sang Lựa chọn 2 (shift_started_at)
      sau này chỉ đổi ĐIỂM GỌI, không đổi logic bên trong.
  (B) closes_at = Task.completed_at + 24h. Task cancelled → đóng NGAY.
  (C) Sau khi đóng: READ-ONLY (giữ lịch sử cho an toàn/tranh chấp — nền tảng
      liên quan trẻ em), chỉ chặn gửi tin mới.
"""

import logging
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from core.models import User, Task, TaskApplication, Notification
from core.views import send_expo_push_notification

from .models import Conversation, Message

logger = logging.getLogger('educarelink.chat')

# Cửa sổ chat sau khi ca làm kết thúc (giờ)
CHAT_WINDOW_HOURS_AFTER_COMPLETION = 24

# Giới hạn nội dung tin nhắn — đủ dài cho trao đổi thật, chặn spam khối lượng.
# Tham chiếu: Task.title 255, message chat 2000 (chat nên dài hơn tiêu đề).
MAX_MESSAGE_LENGTH = 2000
MIN_MESSAGE_LENGTH = 1

# Giới hạn số tin nhắn trả về mỗi lần polling (client ?since=<id> — chỉ lấy
# tin MỚI nên 100 là dư thoải mái cho 1 chu kỳ poll 4s).
MESSAGES_PAGE_LIMIT = 100


def _notify_user(user: User, title: str, message: str, data: dict = None):
    """Helper gửi in-app Notification + Expo push — copy pattern
    tracking/services._notify_user (§15.1: chat không được import tracking,
    core thì được — send_expo_push_notification nằm ở core.views).
    """
    try:
        Notification.objects.create(recipient=user, title=title, message=message)
    except Exception as e:
        logger.warning(f"[chat] Notification create thất bại: {e}")
    try:
        if user.expo_push_token:
            send_expo_push_notification(
                token=user.expo_push_token,
                title=title,
                body=message,
                data=data or {},
            )
    except Exception as e:
        logger.warning(f"[chat] Expo push thất bại cho user#{user.id}: {e}")


# ═══════════════════════════════════════════════════════════════════
#  KIỂM DUYỆT NỘI DUNG TIN NHẮN (bắt buộc — nền tảng liên quan trẻ em)
# ═══════════════════════════════════════════════════════════════════

def moderate_message(content: str) -> dict:
    """
    Kiểm duyệt nội dung tin nhắn chat TRƯỚC KHI lưu.

    Tái dùng bộ lọc từ khoá cấm của moderation (single source of truth —
    cập nhật từ khoá ở moderation tự áp dụng cho chat). ĐÂY là trường hợp
    "bất khả kháng" được §15.1 cho phép import chéo + comment giải thích:
    nhân bản danh sách từ khoá cấm sang chat sẽ gây lệch phiên bản — trên
    nền tảng liên quan trẻ em, lệch bộ lilter là rủi ro an toàn thật.

    Chỉ dùng phần KHỚP TỪ KHOÁ CẤM (banned keywords + anti-bypass variants)
    của _check_banned_keywords — KHÔNG áp category check hay price check
    (đó là logic riêng của task, không hợp cho tin nhắn).

    Gemini: KHÔNG gọi cho mọi tin nhắn (tốn kém + chậm) — giống
    _check_banned_keywords, từ khoá cấm chặn đồng bộ là đủ cho chat 1-1;
    tần suất gửi tin cao hơn nhiều so với tạo task.

    Trả về {'banned': bool, 'reason': str}.
    """
    if not content:
        return {'banned': False, 'reason': ''}

    # Import chéo module phụ — lý do bất khả kháng ghi ở docstring trên.
    from moderation.services import BANNED_KEYWORDS, _all_text_variants, _compact_text

    text_variants = _all_text_variants(content)
    for keyword in BANNED_KEYWORDS:
        keyword_compact = _compact_text(keyword)
        for variant in text_variants:
            if keyword in variant or keyword_compact in variant:
                return {
                    'banned': True,
                    'reason': f'Tin nhắn chứa nội dung không được phép (từ khoá: "{keyword}"). Vui lòng gửi lại nội dung phù hợp.',
                }
    return {'banned': False, 'reason': ''}


# ═══════════════════════════════════════════════════════════════════
#  MỞ / ĐÓNG CỬA SỔ CHAT (gọi từ chat/signals.py khi Task đổi status)
# ═══════════════════════════════════════════════════════════════════

def open_conversation_for_task(task: Task) -> Conversation | None:
    """
    Mở cửa sổ chat khi task bắt đầu ca làm (Lựa chọn A-1: status →
    'in_progress' tại ApproveCandidateAPIView — signal gọi hàm này).

    Idempotent: đã có conversation → trả về record hiện có, không tạo lại
    (chống signal chạy 2 lần / task save lại).

    Trả về None nếu task chưa có worker được accept (không có ai để chat).
    """
    accepted_app = TaskApplication.objects.filter(
        task=task, status='accepted',
    ).select_related('worker').first()
    if not accepted_app or not accepted_app.worker_id:
        logger.info(f"[chat] Task#{task.id} không có worker accepted — không mở conversation.")
        return None

    conversation, created = Conversation.objects.get_or_create(
        task=task,
        defaults={
            'parent': task.parent,
            'worker': accepted_app.worker,
            'opens_at': timezone.now(),
            'status': 'open',
        },
    )
    if created:
        logger.info(
            f"[chat] Conversation#{conversation.id} MỞ cho Task#{task.id} "
            f"({task.parent.username} ↔ {accepted_app.worker.username})"
        )
    return conversation


def close_conversation_for_task(task: Task) -> Conversation | None:
    """
    Đặt hạn đóng cửa sổ chat khi task kết thúc.

      - Task 'completed' → closes_at = completed_at + CHAT_WINDOW_HOURS (24h).
        Status GIỮ 'open' tới khi hết hạn — việc đóng diễn ra bởi scheduler
        hoặc lazy-close ở mọi API read/write (bảo đảm đúng kể cả khi
        scheduler chưa chạy — mô phỏng pattern deadline của B5).
        Fallback: task.completed_at NULL (task cũ pre-migration / seed data)
        → dùng now() thay thế.
      - Task 'cancelled' → ĐÓNG NGAY (closes_at = now, status='closed',
        closed_at=now). Lý do: không có ca làm thật sự diễn ra, không có gì
        để "wrap-up" sau ca; giữ kênh mở sau khi huỷ chỉ tạo cơ hội tranh
        chấp/quấy rối mà không phục vụ nhu vọng trao đổi về việc chăm sóc.

    Idempotent: conversation chưa tồn tại → trả None (task bị huỷ khi chưa
    từng in_progress thì chưa từng có chat).
    """
    try:
        conversation = Conversation.objects.get(task=task)
    except Conversation.DoesNotExist:
        return None

    now = timezone.now()

    if task.status == 'cancelled':
        conversation.closes_at = now
        conversation.status = 'closed'
        conversation.closed_at = now
        conversation.save(update_fields=['closes_at', 'status', 'closed_at', 'updated_at'])
        logger.info(f"[chat] Conversation#{conversation.id} ĐÓNG NGAY — Task#{task.id} bị huỷ.")
        return conversation

    # task completed (hoặc các trạng thái kết thúc khác trong tương lai)
    base_time = task.completed_at or now
    conversation.closes_at = base_time + timedelta(
        hours=CHAT_WINDOW_HOURS_AFTER_COMPLETION,
    )
    conversation.save(update_fields=['closes_at', 'updated_at'])
    logger.info(
        f"[chat] Conversation#{conversation.id} sẽ đóng lúc "
        f"{conversation.closes_at:%H:%M:%S} (Task#{task.id} completed + "
        f"{CHAT_WINDOW_HOURS_AFTER_COMPLETION}h)"
    )
    return conversation


def _ensure_window(conversation: Conversation) -> Conversation:
    """
    Lazy-close: nếu status='open' nhưng đã quá closes_at → chuyển 'closed'
    NGAY TRƯỚC khi trả dữ liệu / nhận tin. Bảo đảm trạng thái cửa sổ LUÔN
    chính xác ở mọi API read/write, không phụ thuộc scheduler chạy hay
    người dùng mở app đúng lúc (yêu cầu spec mục scheduler).
    """
    if (
        conversation.status == 'open'
        and conversation.closes_at
        and timezone.now() >= conversation.closes_at
    ):
        conversation.status = 'closed'
        conversation.closed_at = timezone.now()
        conversation.save(update_fields=['status', 'closed_at', 'updated_at'])
        logger.info(f"[chat] Conversation#{conversation.id} lazy-closed (quá hạn closes_at).")
    return conversation


# ═══════════════════════════════════════════════════════════════════
#  PERMISSION + LẤY CONVERSATION
# ═══════════════════════════════════════════════════════════════════

def get_conversation_for_requester(*, task_id: int, requester: User) -> Conversation:
    """
    Lấy conversation theo task_id + kiểm tra quyền.

    Raise:
      - ValueError: không tìm thấy task / chưa có conversation (task chưa
        từng in_progress) — trả 404, KHÔNG tiết lộ gì thêm.
      - PermissionError: người không liên quan (kể cả parent/worker khác
        task) — 403. Admin không chat (không phải bên trong hội thoại)
        nhưng service riêng cho admin xem lịch sử (mục đích an toàn).
    """
    try:
        task = Task.objects.get(pk=task_id)
    except Task.DoesNotExist:
        raise ValueError("Không tìm thấy công việc.")

    try:
        conversation = Conversation.objects.select_related('task', 'parent', 'worker').get(task=task)
    except Conversation.DoesNotExist:
        raise ValueError(
            "Công việc này chưa có cuộc trò chuyện (chưa từng bắt đầu ca làm)."
        )

    if conversation.parent_id != requester.id and conversation.worker_id != requester.id:
        raise PermissionError("Bạn không có quyền truy cập cuộc trò chuyện này.")

    return _ensure_window(conversation)


def serialize_conversation(conversation: Conversation, requester: User) -> dict:
    """Chuyển conversation → dict cho API (kèm last_message + unread_count)."""
    last_message = (
        conversation.messages.select_related('sender').order_by('-id').first()
    )
    # Tin chưa đọc = tin NGƯỜI KIA gửi mà requester chưa đọc
    unread_count = conversation.messages.filter(
        read_at__isnull=True,
    ).exclude(sender_id=requester.id).count()

    other = (
        conversation.worker if conversation.parent_id == requester.id
        else conversation.parent
    )

    return {
        'task_id': conversation.task_id,
        'task_title': conversation.task.title,
        'task_status': conversation.task.status,
        'other_party': {
            'id': other.id,
            'username': other.username,
            'first_name': other.first_name,
            'last_name': other.last_name,
            'avatar_url': other.avatar_url,
        },
        'opens_at': conversation.opens_at.isoformat(),
        'closes_at': conversation.closes_at.isoformat() if conversation.closes_at else None,
        'status': conversation.status,  # 'open' | 'closed' — đã qua lazy-close
        'closed_at': conversation.closed_at.isoformat() if conversation.closed_at else None,
        'last_message': {
            'id': last_message.id,
            'sender_id': last_message.sender_id,
            'content': last_message.content[:120],
            'created_at': last_message.created_at.isoformat(),
            'read_at': last_message.read_at.isoformat() if last_message.read_at else None,
        } if last_message else None,
        'unread_count': unread_count,
    }


def list_conversations_for_user(*, requester: User, limit: int = 50) -> list:
    """Danh sách hội thoại của user (parent hoặc worker), mới cập nhật trước."""
    qs = (
        Conversation.objects.filter(
            Q(parent=requester) | Q(worker=requester),
        )
        .select_related('task', 'parent', 'worker')
        .order_by('-updated_at')[:limit]
    )
    return [serialize_conversation(_ensure_window(c), requester) for c in qs]


# ═══════════════════════════════════════════════════════════════════
#  GỌI / ĐỌC TIN NHẮN
# ═══════════════════════════════════════════════════════════════════

@transaction.atomic
def send_message(*, task_id: int, sender: User, content: str) -> Message:
    """
    Gửi tin nhắn trong conversation của task.

    Quy trình (đúng thứ tự — kiểm duyệt TRƯỚC KHI lưu):
      1. Permission + tồn tại conversation (get_conversation_for_requester)
      2. Kiểm duyệt nội dung (moderate_message) — bị chặn → ValueError,
         KHÔNG tạo Message row, log lại cho admin đối chiếu
      3. Kiểm tra cửa sổ còn mở — đóng → PermissionError 403
         "Cuộc trò chuyện đã hết hiệu lực" (read-only policy C)
      4. Lưu Message + notify người kia (in-app + Expo push best-effort,
         data.type='new_chat_message' để mobile điều hướng)

    Race-condition: 2 tin gửi đồng thời → mỗi tin là 1 Message row riêng
    (INSERT, không update-in-place) → không ghi đè/mất dữ liệu; select_for_update
    trên conversation để thread tuần tự hoá phần check cửa sổ (SQLite serialise
    sẵn, PostgreSQL cần lock).
    """
    if content is None or not str(content).strip():
        raise ValueError("Nội dung tin nhắn không được để trống.")
    content = str(content).strip()
    if len(content) < MIN_MESSAGE_LENGTH:
        raise ValueError("Nội dung tin nhắn không được để trống.")
    if len(content) > MAX_MESSAGE_LENGTH:
        raise ValueError(
            f"Tin nhắn quá dài ({len(content)} ký tự, giới hạn {MAX_MESSAGE_LENGTH})."
        )

    # (1) Permission — cũng lazy-close cửa sổ nếu đã quá hạn
    conversation = get_conversation_for_requester(task_id=task_id, requester=sender)

    # Lock conversation row để check cửa sổ + insert message nguyên tố
    locked = Conversation.objects.select_for_update().get(pk=conversation.pk)

    # (2) Kiểm duyệt nội dung — TRƯỚC khi lưu
    verdict = moderate_message(content)
    if verdict['banned']:
        logger.warning(
            f"[chat] Message bị chặn bởi kiểm duyệt — Conversation#{locked.id}, "
            f"sender=User#{sender.id}, reason={verdict['reason']}"
        )
        raise ValueError(verdict['reason'])

    # (3) Cửa sổ phải còn mở (re-check sau lock — chống race với close)
    if locked.status != 'open':
        raise PermissionError(
            "Cuộc trò chuyện đã hết hiệu lực — bạn chỉ có thể xem lại lịch sử."
        )

    # (4) Lưu + notify
    message = Message.objects.create(
        conversation=locked,
        sender=sender,
        content=content,
    )
    # updated_at của conversation dùng cho sort danh sách hội thoại
    Conversation.objects.filter(pk=locked.pk).update(updated_at=timezone.now())

    recipient = locked.worker if locked.parent_id == sender.id else locked.parent
    _notify_user(
        recipient,
        title=f"💬 Tin nhắn mới từ {sender.username}",
        message=content[:100],
        data={
            'type': 'new_chat_message',
            'task_id': locked.task_id,
            'conversation_id': locked.id,
            'message_id': message.id,
            'sender_id': sender.id,
        },
    )

    logger.info(
        f"[chat] Message#{message.id} gửi thành công — Conversation#{locked.id}, "
        f"sender=User#{sender.id}"
    )
    return message


def get_messages(*, task_id: int, requester: User, since: int = None) -> list:
    """
    Lấy tin nhắn của conversation, thứ tự id TĂNG DẦN (client append).

    ?since=<id> — chỉ lấy tin có id > since (polling; client giữ id lớn
    nhất đã có). Không since → lấy trang cuối (default PAGE_LIMIT).
    """
    conversation = get_conversation_for_requester(task_id=task_id, requester=requester)

    qs = conversation.messages.select_related('sender').order_by('id')
    if since is not None:
        try:
            since = int(since)
        except (TypeError, ValueError):
            raise ValueError("Tham số 'since' phải là số nguyên (id tin nhắn).")
        qs = qs.filter(id__gt=since)
        messages = list(qs[:MESSAGES_PAGE_LIMIT])
    else:
        # Trang cuối: lấy PAGE_LIMIT tin mới nhất rồi đảo lại thứ tự cũ → mới
        messages = list(qs.order_by('-id')[:MESSAGES_PAGE_LIMIT])
        messages.reverse()

    return [
        {
            'id': m.id,
            'sender_id': m.sender_id,
            'sender_name': m.sender.username,
            'content': m.content,
            'created_at': m.created_at.isoformat(),
            'read_at': m.read_at.isoformat() if m.read_at else None,
        }
        for m in messages
    ]


def mark_messages_read(*, task_id: int, requester: User) -> int:
    """
    Đánh dấu ĐÃ ĐỌC mọi tin nhắn người kia gửi cho requester
    (read_at = now). Trả về số tin vừa đánh dấu.

    Không đánh dấu tin của chính requester gửi (read_at chỉ có nghĩa với
    người nhận).
    """
    conversation = get_conversation_for_requester(task_id=task_id, requester=requester)

    unread = conversation.messages.filter(
        read_at__isnull=True,
    ).exclude(sender_id=requester.id)

    now = timezone.now()
    count = unread.update(read_at=now)
    if count > 0:
        logger.info(
            f"[chat] User#{requester.id} đã đọc {count} tin — "
            f"Conversation#{conversation.id}"
        )
    return count


# ═══════════════════════════════════════════════════════════════════
#  ADMIN — xem lịch sử hội thoại (mục đích an toàn/tranh chấp)
# ═══════════════════════════════════════════════════════════════════

def get_conversation_messages_for_admin(*, task_id: int, requester: User, limit: int = 200) -> dict:
    """
    Admin xem lịch sử hội thoại của task (kể cả conversation của người khác)
    — phục vụ xử lý tranh chấp/an toàn. Chỉ admin (is_superuser/is_staff).
    """
    if not (requester.is_superuser or requester.is_staff):
        raise PermissionError("Chỉ admin mới được xem hội thoại của người khác.")

    try:
        task = Task.objects.get(pk=task_id)
    except Task.DoesNotExist:
        raise ValueError("Không tìm thấy công việc.")

    try:
        conversation = Conversation.objects.select_related('task', 'parent', 'worker').get(task=task)
    except Conversation.DoesNotExist:
        raise ValueError("Công việc này chưa có cuộc trò chuyện.")

    messages = list(
        conversation.messages.select_related('sender').order_by('-id')[:limit]
    )
    messages.reverse()

    return {
        'task_id': task.id,
        'task_title': task.title,
        'conversation_status': conversation.status,
        'parent': conversation.parent.username,
        'worker': conversation.worker.username,
        'messages': [
            {
                'id': m.id,
                'sender_id': m.sender_id,
                'sender_name': m.sender.username,
                'content': m.content,
                'created_at': m.created_at.isoformat(),
                'read_at': m.read_at.isoformat() if m.read_at else None,
            }
            for m in messages
        ],
    }
