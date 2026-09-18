"""B1 — Service layer cho Care Diary.

Business logic tách biệt khỏi views (§15.3).
Chỉ phụ thuộc core models — không import payments/tracking/moderation.
"""

from django.core.exceptions import PermissionDenied

from core.models import Task, TaskApplication

from .models import CareDiaryActivity, CareDiaryEntry


# Từ vựng mood_icon THỐNG NHẤT 3 nền tảng (2026-09-15):
#   - Mobile form (CareDiaryFormScreen): happy / sad / alert-circle / thumbs-up
#   - Web form (worker_care_diary_form): happy / neutral / sad / excited
#   - Seed/demo cũ: emoji (🎨 😊 👍 ...)
# Chuẩn hoá về 1 tập canonical: happy / neutral / sad / excited /
# alert-circle / thumbs-up — mỗi client tự map ra glyph của font mình.
MOOD_ICON_ALIASES = {
    # emoji seed/demo cũ → canonical
    '🎨': 'excited', '🌟': 'excited', '⭐': 'excited',
    '😊': 'happy', '🙂': 'happy', '😄': 'happy', '😀': 'happy',
    '😢': 'sad', '😭': 'sad', '😞': 'sad',
    '⚠️': 'alert-circle', '⚠': 'alert-circle', '❗': 'alert-circle',
    '👍': 'thumbs-up',
    # tên glyph trùng giữa các client
    'warning': 'alert-circle',
    'thumb_up': 'thumbs-up',
}


def normalize_mood_icon(raw):
    """Chuẩn hoá mood_icon về từ vựng canonical. Giữ nguyên nếu không nhận ra."""
    if not raw:
        return ''
    key = str(raw).strip()
    return MOOD_ICON_ALIASES.get(key, key)


def _get_accepted_application(*, task_id, worker):
    """Lấy application đã accepted cho task+worker. Raise nếu không tìm thấy."""
    try:
        return TaskApplication.objects.get(
            task_id=task_id, worker=worker, status='accepted',
        )
    except TaskApplication.DoesNotExist:
        raise PermissionError(
            'Bạn không phải CarePartner được nhận việc này.'
        )


def check_worker_can_write(*, task, worker):
    """Kiểm tra worker được phép tạo/sửa nhật ký cho task.

    Raises:
        PermissionError: worker không phải người được accepted.
        ValueError: task đang open (chưa bắt đầu làm).
    """
    _get_accepted_application(task_id=task.id, worker=worker)
    if task.status == 'open':
        raise ValueError(
            'Chỉ được ghi nhật ký khi công việc đã bắt đầu hoặc đã hoàn thành.'
        )
    if task.status == 'cancelled':
        raise ValueError(
            'Không thể ghi nhật ký cho công việc đã bị hủy.'
        )


def check_can_read(*, task, user):
    """Kiểm tra user được phép xem nhật ký.

    Raises:
        PermissionError: user không phải parent chủ task hay worker accepted.
    """
    if task.parent_id == user.id:
        return  # parent chủ task
    # Kiểm tra user là worker đã được accepted trên task này
    try:
        TaskApplication.objects.get(
            task_id=task.id, worker=user, status='accepted',
        )
        return  # worker accepted — có quyền xem (nếu chưa có entry thì trả 404 ở view)
    except TaskApplication.DoesNotExist:
        pass
    raise PermissionError('Bạn không có quyền xem nhật ký này.')


def parse_completion_percent(raw):
    """Parse + validate completion_percent (0-100). Raise ValueError nếu sai."""
    try:
        val = int(raw)
    except (TypeError, ValueError):
        raise ValueError('completion_percent phải là số nguyên.')
    if val < 0 or val > 100:
        raise ValueError('completion_percent phải nằm trong khoảng 0-100.')
    return val


# ═══════════════════════════════════════════════════════════════════
# CARE DIARY NÂNG CẤP — Form đánh giá chuyên sâu theo danh mục
# ═══════════════════════════════════════════════════════════════════

ASSESSMENT_SCHEMA_VERSION = 1

# Map danh mục → các assessment_type được phép gửi. M1: key theo
# ServiceCategory.code (slug ổn định, tự sinh bởi save()) thay vì name
# hiển thị — admin đổi tên (thêm khoảng trắng, đổi cách viết...) không làm
# tính năng âm thầm rơi về general.
# 'gia-su'    (Gia sư)     → form học tập hoặc form chung
# 'trong-tre' (Trông trẻ)  → form sinh hoạt hoặc form chung
# Danh mục khác (Đón trẻ / legacy đã khóa) → chỉ form chung.
CATEGORY_ASSESSMENT_TYPES = {
    'gia-su': ['tutoring', 'general'],
    'trong-tre': ['childcare', 'general'],
}
DEFAULT_ASSESSMENT_TYPES = ['general']

# M2 — giới hạn kích thước dữ liệu tự do trong assessment_data: chặn phình
# DB / vector DoS nhẹ (POST/PATCH thủ công có thể gửi vài MB text hoặc hàng
# nghìn phần tử meals nếu không có trần). UI mobile/web đều nhỏ hơn trần
# này nên client hợp lệ không bao giờ chạm giới hạn.
MAX_TEXT_FIELD_LEN = 2000
MAX_MEALS = 20
MAX_ACTIVITY_ITEMS = 30


def _check_text_len(value, section, field, errors):
    """M2 — thêm lỗi field-level nếu value (str) vượt MAX_TEXT_FIELD_LEN."""
    if value is None:
        return
    if len(str(value)) > MAX_TEXT_FIELD_LEN:
        errors.setdefault(section, []).append(
            "Trường '{}' không được vượt quá {} ký tự.".format(
                field, MAX_TEXT_FIELD_LEN))


class AssessmentValidationError(Exception):
    """Lỗi validate form đánh giá chuyên sâu — mang theo dict lỗi field-level.

    .errors có 2 dạng shape (theo API contract):
      {'assessment_type': ['...']}                      — sai loại/danh mục
      {'assessment_data': {'section': ['message', ..]}} — thiếu/sai field
    Views bắt exception này → trả 400 với đúng .errors (không trả lỗi chung chung).
    """

    def __init__(self, errors):
        self.errors = errors
        super().__init__(str(errors))


def get_allowed_assessment_types(task):
    """Danh sách assessment_type được phép cho task theo category của nó.

    M1 — so khớp theo category.code (slug ổn định do hệ thống tự sinh,
    không đổi khi admin sửa name hiển thị). Category rỗng code (legacy
    chưa backfill) hoặc code lạ → rơi về general (an toàn, như cũ).
    """
    if task.category and task.category.code:
        allowed = CATEGORY_ASSESSMENT_TYPES.get(task.category.code)
        if allowed:
            return allowed
    return DEFAULT_ASSESSMENT_TYPES


def _validate_tutoring(data, errors):
    """Form Gia sư — bắt buộc: lesson_content.subject/topic,
    comprehension.score (1-5), classwork_homework.classwork_status."""
    lesson = data.get('lesson_content')
    if not isinstance(lesson, dict):
        errors['lesson_content'] = ["Thiếu thông tin bài học (subject, topic)."]
    else:
        if not str(lesson.get('subject', '') or '').strip():
            errors.setdefault('lesson_content', []).append(
                "Trường 'subject' là bắt buộc.")
        if not str(lesson.get('topic', '') or '').strip():
            errors.setdefault('lesson_content', []).append(
                "Trường 'topic' là bắt buộc.")

    comp = data.get('comprehension')
    if not isinstance(comp, dict):
        errors['comprehension'] = ["Thiếu thông tin tiếp thu bài (score)."]
    else:
        score = comp.get('score', None)
        valid_score = False
        if isinstance(score, int) and not isinstance(score, bool):
            valid_score = 1 <= score <= 5
        elif isinstance(score, str) and score.strip().isdigit():
            valid_score = 1 <= int(score) <= 5
        if not valid_score:
            errors.setdefault('comprehension', []).append(
                "Trường 'score' là bắt buộc và phải từ 1 đến 5.")

    classwork = data.get('classwork_homework')
    if not isinstance(classwork, dict):
        errors['classwork_homework'] = ["Thiếu tình trạng bài tập trên lớp."]
    elif not str(classwork.get('classwork_status', '') or '').strip():
        errors.setdefault('classwork_homework', []).append(
            "Trường 'classwork_status' là bắt buộc.")

    # M2 — giới hạn độ dài các trường text tự do (chỉ kiểm khi có giá trị)
    if isinstance(lesson, dict):
        _check_text_len(lesson.get('subject'), 'lesson_content', 'subject', errors)
        _check_text_len(lesson.get('topic'), 'lesson_content', 'topic', errors)
    if isinstance(classwork, dict):
        _check_text_len(classwork.get('classwork_status'),
                        'classwork_homework', 'classwork_status', errors)
        _check_text_len(classwork.get('homework'),
                        'classwork_homework', 'homework', errors)
    remarks = data.get('remarks')
    if isinstance(remarks, dict):
        _check_text_len(remarks.get('knowledge_gap'), 'remarks', 'knowledge_gap', errors)
        _check_text_len(remarks.get('next_session_plan'),
                        'remarks', 'next_session_plan', errors)
    # Các section không lường trước (client gửi thêm key lạ) cũng chặn trần
    # độ dài để không có lỗ hổng lách qua key tùy chỉnh.
    for key, value in data.items():
        if key in ('lesson_content', 'comprehension', 'classwork_homework', 'remarks'):
            continue
        if isinstance(value, str) and len(value) > MAX_TEXT_FIELD_LEN:
            errors.setdefault(key, []).append(
                "Trường '{}' không được vượt quá {} ký tự.".format(
                    key, MAX_TEXT_FIELD_LEN))


def _validate_childcare(data, errors):
    """Form Trông trẻ — bắt buộc: meals (≥1 phần tử có time + amount),
    nap.quality, hygiene_health.physical_condition."""
    meals = data.get('meals')
    if not isinstance(meals, list) or len(meals) == 0:
        errors['meals'] = ["Cần ít nhất 1 bữa ăn với 'time' và 'amount'."]
    else:
        # M2 — trần số lượng bữa ăn
        if len(meals) > MAX_MEALS:
            errors['meals'] = [
                "Không được vượt quá {} bữa ăn.".format(MAX_MEALS)]
        for idx, meal in enumerate(meals):
            if not isinstance(meal, dict) or not str(
                meal.get('time', '') or ''
            ).strip() or not str(meal.get('amount', '') or '').strip():
                errors.setdefault('meals', []).append(
                    f"Bữa ăn thứ {idx + 1} thiếu 'time' hoặc 'amount'.")
            elif isinstance(meal, dict):
                # M2 — giới hạn độ dài từng trường của bữa ăn
                for field in ('time', 'meal', 'amount'):
                    _check_text_len(meal.get(field), 'meals', field, errors)

    nap = data.get('nap')
    if not isinstance(nap, dict):
        errors['nap'] = ["Trường 'quality' là bắt buộc."]
    elif not str(nap.get('quality', '') or '').strip():
        errors.setdefault('nap', []).append("Trường 'quality' là bắt buộc.")

    hygiene = data.get('hygiene_health')
    if not isinstance(hygiene, dict):
        errors['hygiene_health'] = ["Trường 'physical_condition' là bắt buộc."]
    elif not str(hygiene.get('physical_condition', '') or '').strip():
        errors.setdefault('hygiene_health', []).append(
            "Trường 'physical_condition' là bắt buộc.")

    # M2 — giới hạn độ dài các trường text tự do của form sinh hoạt
    if isinstance(nap, dict):
        _check_text_len(nap.get('quality'), 'nap', 'quality', errors)
        _check_text_len(nap.get('start_time'), 'nap', 'start_time', errors)
        _check_text_len(nap.get('end_time'), 'nap', 'end_time', errors)
    if isinstance(hygiene, dict):
        _check_text_len(hygiene.get('physical_condition'),
                        'hygiene_health', 'physical_condition', errors)
        _check_text_len(hygiene.get('diaper_toilet'),
                        'hygiene_health', 'diaper_toilet', errors)
    notes = data.get('notes_for_parents')
    _check_text_len(notes, 'notes_for_parents', 'notes_for_parents', errors)
    activities = data.get('activities')
    if isinstance(activities, dict):
        _check_text_len(activities.get('mood_during'),
                        'activities', 'mood_during', errors)
        act_list = activities.get('list')
        if isinstance(act_list, list):
            if len(act_list) > MAX_ACTIVITY_ITEMS:
                errors.setdefault('activities', []).append(
                    "Không được vượt quá {} hoạt động.".format(MAX_ACTIVITY_ITEMS))
            for idx, item in enumerate(act_list):
                _check_text_len(item, 'activities', f'hoạt động thứ {idx + 1}', errors)
    # Các section không lường trước cũng chặn trần độ dài (key tùy chỉnh)
    for key, value in data.items():
        if key in ('meals', 'nap', 'hygiene_health', 'activities', 'notes_for_parents'):
            continue
        if isinstance(value, str) and len(value) > MAX_TEXT_FIELD_LEN:
            errors.setdefault(key, []).append(
                "Trường '{}' không được vượt quá {} ký tự.".format(
                    key, MAX_TEXT_FIELD_LEN))


def validate_assessment_data(task, assessment_type, assessment_data,
                             current_type=None, current_data=None,
                             allow_clear=False):
    """Validate loại + nội dung form đánh giá theo danh mục công việc.

    Args:
        current_type / current_data: giá trị hiện tại của entry (chỉ dùng
            ở nhánh PATCH) — để nhận diện hạ cấp tutoring/childcare → general
            khi entry đang mang dữ liệu đánh giá đã lưu (H1).
        allow_clear: client gửi kèm confirm_clear_assessment=true — xác nhận
            rõ ràng rằng mình chấp nhận xóa dữ liệu đánh giá cũ khi hạ cấp.

    Returns:
        (clean_type, clean_data) — clean_data luôn có schema_version.

    Raises:
        AssessmentValidationError: với .errors là dict field-level
        (shape khớp API contract — xem class docstring).
    """
    valid_choices = dict(CareDiaryEntry.ASSESSMENT_CHOICES).keys()
    if assessment_type not in valid_choices:
        raise AssessmentValidationError({
            'assessment_type': [
                "Loại đánh giá không hợp lệ: '{}'. Giá trị cho phép: {}.".format(
                    assessment_type, ', '.join(valid_choices)),
            ],
        })

    allowed = get_allowed_assessment_types(task)
    if assessment_type not in allowed:
        raise AssessmentValidationError({
            'assessment_type': [
                "Danh mục công việc này không hỗ trợ loại đánh giá '{}'."
                .format(assessment_type),
            ],
        })

    if assessment_type == 'general':
        # H1 — chống mất dữ liệu âm thầm: hạ cấp tutoring/childcare → general
        # sẽ xóa toàn bộ assessment_data đã lưu (điểm tiếp thu, bữa ăn, giấc
        # ngủ...) — dữ liệu phụ huynh dùng theo dõi con, mất là mất thật.
        # Nếu entry đang có dữ liệu chuyên sâu không rỗng, bắt buộc client
        # xác nhận rõ ràng qua confirm_clear_assessment=true.
        if (current_type in (CareDiaryEntry.ASSESSMENT_TUTORING,
                             CareDiaryEntry.ASSESSMENT_CHILDCARE)
                and current_data and not allow_clear):
            raise AssessmentValidationError({
                'assessment_type': [
                    "Đổi về form chung sẽ xóa dữ liệu đánh giá đã lưu. "
                    "Gửi kèm confirm_clear_assessment=true nếu chắc chắn.",
                ],
            })
        # Form chung — assessment_data luôn là {} (giữ nguyên hành vi cũ,
        # tương thích ngược 100% với mọi entry trước nâng cấp).
        return assessment_type, {}

    if not isinstance(assessment_data, dict):
        raise AssessmentValidationError({
            'assessment_data': ['assessment_data phải là object (dict).'],
        })

    clean = {
        k: v for k, v in assessment_data.items() if k != 'schema_version'
    }
    errors = {}
    if assessment_type == 'tutoring':
        _validate_tutoring(clean, errors)
    else:
        _validate_childcare(clean, errors)
    if errors:
        raise AssessmentValidationError({'assessment_data': errors})

    clean['schema_version'] = ASSESSMENT_SCHEMA_VERSION
    return assessment_type, clean


def get_parent_diary_history(*, parent):
    """Lấy danh sách rút gọn nhật ký của phụ huynh, sắp xếp mới nhất trước.

    Sắp xếp theo task.scheduled_time DESC (thời gian buổi chăm sóc thực tế),
    không phải entry.created_at. Lý do: phụ huynh muốn theo dõi tiến bộ
    theo thứ tự các buổi diễn ra, chứ không phải theo lúc CarePartner ghi.
    """
    from django.utils import timezone as django_tz

    entries = CareDiaryEntry.objects.filter(
        task__parent=parent,
    ).select_related('task', 'worker').order_by('-task__scheduled_time', '-created_at')

    weekday_names = [
        'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm',
        'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật',
    ]
    result = []
    for entry in entries:
        # BUG-10 fix: dùng task.scheduled_time (thời gian buổi chăm sóc),
        # không phải entry.created_at (thời gian ghi nhật ký).
        local_scheduled = django_tz.localtime(entry.task.scheduled_time)
        date_str = (
            f"{weekday_names[local_scheduled.weekday()]}, "
            f"{local_scheduled.day} Tháng {local_scheduled.month}, {local_scheduled.year}"
        )
        result.append({
            'task_id': entry.task_id,
            'task_title': entry.task.title,
            'date': date_str,
            'mood': {
                'icon': normalize_mood_icon(entry.mood_icon) or 'happy',
                'label': entry.mood_label,
            },
            'completion_percent': entry.completion_percent,
            'worker_name': entry.worker.get_full_name() or entry.worker.username,
        })
    return result


def build_entry_response(*, entry, request=None):
    """Xây dựng response JSON cho 1 CareDiaryEntry.

    Response shape phải khớp với CareDiaryDetailScreen.js đọc:
      carepartner, date, mood, completion, activities, note, attachments.
    """
    from django.utils import timezone as django_tz

    worker = entry.worker
    # Tính stats động từ activities (không lưu riêng — tránh data lệch)
    acts = entry.activities.all()
    total = acts.count()
    done_count = acts.filter(status='done').count()
    partial_count = acts.filter(status='partial').count()
    skipped_count = acts.filter(status='skipped').count()

    # Format date tiếng Việt — BUG-10 fix: dùng scheduled_time, không phải created_at
    local_scheduled = django_tz.localtime(entry.task.scheduled_time)
    weekday_names = [
        'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm',
        'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật',
    ]
    date_str = (
        f"{weekday_names[local_scheduled.weekday()]}, "
        f"{local_scheduled.day} Tháng {local_scheduled.month}, {local_scheduled.year}"
    )

    # Ảnh đính kèm — trả absolute URL
    attachment_list = []
    for att in entry.attachments.all():
        url = None
        if att.image and request:
            url = request.build_absolute_uri(att.image.url)
            # Fix HTTPS trên Render
            import os
            if os.environ.get('RENDER', '') or request.is_secure():
                url = url.replace('http://', 'https://', 1)
        elif att.image:
            url = att.image.url
        attachment_list.append({
            'id': att.id,
            'type': 'image',
            'url': url,
        })

    return {
        'id': entry.id,
        'assessment_type': entry.assessment_type or 'general',
        'assessment_data': entry.assessment_data or {},
        'carepartner': {
            'name': worker.get_full_name() or worker.username,
            'role': 'CarePartner',
            'avatarInitial': (worker.first_name or worker.username)[0].upper(),
            'verified': worker.is_verified,
        },
        'date': date_str,
        'mood': {
            'icon': normalize_mood_icon(entry.mood_icon) or 'happy',
            'label': entry.mood_label,
            'note': entry.mood_note,
        },
        'completion': {
            'percent': entry.completion_percent,
            'stats': [
                {'value': total, 'label': 'Hoạt động', 'color': '#333333'},
                {'value': done_count, 'label': 'Hoàn thành tốt', 'color': '#22c55e'},
                {'value': partial_count, 'label': 'Cần cố gắng', 'color': '#F26522'},
            ],
        },
        'activities': [
            {
                'time': a.time,
                'title': a.title,
                'desc': a.description,
                'status': a.status,
            }
            for a in acts
        ],
        'note': entry.note,
        'attachments': attachment_list,
    }