"""
PHẦN 14 — Phủ dữ liệu mẫu ĐẦY ĐỦ cho TẤT CẢ tài khoản hiện có
(yêu cầu owner 2026-10-06: "mọi tài khoản đều phải có dữ liệu mẫu để ban
giám khảo xem và trải nghiệm, kiểm tra, kiểm thử").

Mục tiêu: ban giám khảo đăng nhập BẤT KỴ tài khoản Phụ huynh / CarePartner
nào cũng thấy hệ thống "đang sống":
  • Phụ huynh     — đơn đủ 4 trạng thái (open / pending_payment / in_progress /
                    completed), chat 2 chiều, thanh toán, thông báo cá nhân.
  • CarePartner   — ứng tuyển, Booking Flow 1 đủ kịch bản (awaiting / committed /
                    in_progress / completed / no_show / hủy có kháng cáo),
                    thanh toán & quyết toán hoa hồng, lịch rảnh, thông báo.

Nguyên tắc an toàn (bắt buộc tuân thủ khi chỉnh sửa):
  • IDEMPOTENT additive-only: chỉ tạo thứ CÒN THIẾU (check exists()) — chạy lại
    bao nhiêu lần cũng không sinh trùng, KHÔNG xoá/sửa dữ liệu có sẵn.
  • KHÔNG đụng username / password / hồ sơ của BẤT KỴ tài khoản nào —
    chỉ tạo dữ liệu nghiệp vụ gắn vào user đã tồn tại.
  • Dữ liệu tạo ra như đơn THẬT (không nhãn demo) và CHỈ phục vụ trẻ ≥ 6 tuổi
    theo chính sách dự án.
  • An toàn pipeline: mỗi khối chạy trong transaction riêng + try/except —
    1 item lỗi chỉ cảnh báo, KHÔNG làm chết deploy.

Thứ tự trong build.sh: SAU seed_super_carepartner (để phủ cả CP chuyên môn),
TRƯỚC seed_care_diary_sample (để nhật ký được sinh cho các ca mới tạo).
"""

import datetime
from datetime import timedelta
from decimal import Decimal as D

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from core.models import (
    ServiceCategory, Task, TaskApplication, Review, Notification,
    WorkerAvailability, User,
)


class Command(BaseCommand):
    help = ('Phủ dữ liệu mẫu đầy đủ cho TẤT CẢ tài khoản Phụ huynh & CarePartner '
            '(idempotent additive-only — chỉ tạo thứ còn thiếu, như đơn thật).')

    # ------------------------------------------------------------------
    def _log(self, msg):
        try:
            self.stdout.write(msg)
        except Exception:
            self.stdout.write(msg.encode('ascii', errors='replace').decode('ascii'))

    # ------------------------------------------------------------------
    def handle(self, *args, **options):
        now = timezone.now()
        today = now.date()
        stats = {'parent_stacks': 0, 'chats': 0, 'payments': 0, 'worker_stacks': 0,
                 'notifications': 0, 'errors': 0}

        from matching.models import (
            JobPost, JobSlot, Booking, EloLedger, Appeal,
            CarePartnerAvailability, CreditTransaction,
        )
        from payments.models import Payment, CommissionSettlement
        from chat.models import Conversation, Message
        from tracking.models import LocationConsent, LiveLocation, DeviceHeartbeat
        self._models = {
            'JobPost': JobPost, 'JobSlot': JobSlot, 'Booking': Booking,
            'EloLedger': EloLedger, 'Appeal': Appeal,
            'CommissionSettlement': CommissionSettlement,
            'CarePartnerAvailability': CarePartnerAvailability,
            'CreditTransaction': CreditTransaction,
            'Conversation': Conversation, 'Message': Message,
            'Payment': Payment, 'LocationConsent': LocationConsent,
            'LiveLocation': LiveLocation, 'DeviceHeartbeat': DeviceHeartbeat,
        }

        parents = list(User.objects.filter(role='parent', is_active=True)
                       .exclude(username='admin').order_by('id'))
        workers = list(User.objects.filter(role='worker', is_active=True).order_by('id'))
        approved_workers = [w for w in workers if w.is_approved]

        cat_tutor = (ServiceCategory.objects.filter(code='gia-su').first()
                     or ServiceCategory.objects.filter(name='Gia sư').first())
        cat_child = (ServiceCategory.objects.filter(code='trong-tre').first()
                     or ServiceCategory.objects.filter(name='Đồng hành cùng trẻ').first())
        cat_pickup = (ServiceCategory.objects.filter(code='don-tre').first()
                      or ServiceCategory.objects.filter(name='Đón trẻ').first())
        cats = [c for c in (cat_tutor, cat_child, cat_pickup) if c]

        self._log('\n' + '=' * 72)
        self._log('  PHỦ DỮ LIỆU MẪU CHO TẤT CẢ TÀI KHOẢN (như đơn thật — trẻ từ 6 tuổi)')
        self._log('=' * 72)
        self._log(f'   i Phụ huynh active: {len(parents)} | CarePartner active: {len(workers)} '
                  f'(đã duyệt: {len(approved_workers)})')

        # ══════════════════════════════════════════════════════════════
        # PASS 1 — PHỤ HUYNH: đơn đủ 4 trạng thái + thông báo cá nhân
        # ══════════════════════════════════════════════════════════════
        self._log('\n[1/4] Phụ huynh — đơn đủ trạng thái, thanh toán, chat, thông báo...')
        worker_pool = approved_workers or workers
        for idx, parent in enumerate(parents):
            try:
                with transaction.atomic():
                    my_tasks = Task.objects.filter(parent=parent)
                    lat = parent.latitude or 16.4602
                    lng = parent.longitude or 107.6008
                    addr = parent.address or '48 Võ Thị Sáu, P. Vĩnh Ninh, TP. Huế'

                    if not my_tasks.filter(status='pending_payment').exists():
                        self._mk_task_stack(
                            parent, self._pick(worker_pool, idx),
                            self._pick(worker_pool, idx + 7), cats,
                            'pending_payment', idx, now, lat, lng, addr, stats)

                    if not my_tasks.filter(status='in_progress').exists():
                        self._mk_task_stack(
                            parent, self._pick(worker_pool, idx + 1),
                            self._pick(worker_pool, idx + 8), cats,
                            'in_progress', idx + 1, now, lat, lng, addr, stats)

                    if not my_tasks.filter(status='completed').exists():
                        self._mk_task_stack(
                            parent, self._pick(worker_pool, idx + 2),
                            self._pick(worker_pool, idx + 9), cats,
                            'completed', idx + 2, now, lat, lng, addr, stats)

                    if not my_tasks.filter(status='open').exists():
                        self._mk_task_stack(
                            parent, self._pick(worker_pool, idx + 3),
                            self._pick(worker_pool, idx + 10), cats,
                            'open', idx + 3, now, lat, lng, addr, stats)

                    if not Notification.objects.filter(recipient=parent).exists():
                        Notification.objects.create(
                            recipient=parent,
                            title='AI ghép cặp: có CarePartner rất phù hợp quanh khu vực bạn',
                            message='Thuật toán ELO vừa tìm thấy các ứng viên có lịch rảnh khớp '
                                    'với nhu cầu của gia đình bạn trong bán kính 3km.')
                        Notification.objects.create(
                            recipient=parent,
                            title='Nhắc lịch: ca làm bắt đầu sau 2 giờ',
                            message='Đừng quên kiểm tra tin nhắn với CarePartner và bật theo dõi '
                                    'hành trình (Live Tracking) khi ca bắt đầu nhé!')
                        stats['notifications'] += 2
                stats['parent_stacks'] += 1
            except Exception as exc:  # noqa: BLE001 — 1 parent lỗi không chết deploy
                stats['errors'] += 1
                self._log(f'   ! Bỏ qua phụ huynh {parent.username}: {exc}')

        # ══════════════════════════════════════════════════════════════
        # PASS 2 — CHAT cho mọi task in_progress/completed còn thiếu
        # ══════════════════════════════════════════════════════════════
        self._log('\n[2/4] Chat — tạo cửa sổ hội thoại cho mọi ca có CarePartner nhận...')
        for task in Task.objects.filter(status__in=('in_progress', 'completed')):
            try:
                if Conversation.objects.filter(task=task).exists():
                    continue
                acc = (TaskApplication.objects.filter(task=task, status='accepted')
                       .select_related('worker').first())
                if acc is None:
                    continue
                with transaction.atomic():
                    self._mk_conversation(task, acc.worker, now)
                stats['chats'] += 1
            except Exception as exc:  # noqa: BLE001
                stats['errors'] += 1
                self._log(f'   ! Bỏ qua chat task #{task.id}: {exc}')

        # ══════════════════════════════════════════════════════════════
        # PASS 3 — THANH TOÁN cho mọi task hợp lệ còn thiếu
        # ══════════════════════════════════════════════════════════════
        self._log('\n[3/4] Thanh toán — ký quỹ/giải ngân cho mọi ca còn thiếu...')
        for task in Task.objects.filter(
                status__in=('pending_payment', 'in_progress', 'completed')):
            try:
                if Payment.objects.filter(task=task).exists():
                    continue
                acc = (TaskApplication.objects.filter(task=task, status='accepted')
                       .select_related('worker').first())
                if acc is None:
                    continue
                with transaction.atomic():
                    self._mk_payment(task, acc.worker, now)
                stats['payments'] += 1
            except Exception as exc:  # noqa: BLE001
                stats['errors'] += 1
                self._log(f'   ! Bỏ qua payment task #{task.id}: {exc}')

        # ══════════════════════════════════════════════════════════════
        # PASS 4 — CAREPARTNER: ứng tuyển, Booking Flow 1, quyết toán,
        #          lịch rảnh, thông báo
        # ══════════════════════════════════════════════════════════════
        self._log('\n[4/4] CarePartner — ứng tuyển, Booking Flow 1, thu nhập, lịch rảnh...')
        open_tasks = list(Task.objects.filter(status='open').order_by('id'))
        scenarios = ['completed', 'in_progress', 'committed', 'awaiting_commitment',
                     'no_show', 'cancelled_by_carepartner']
        for idx, worker in enumerate(workers):
            try:
                with transaction.atomic():
                    if not Notification.objects.filter(recipient=worker).exists():
                        Notification.objects.create(
                            recipient=worker,
                            title='Bạn có lời mời nhận ca mới phù hợp với lịch rảnh',
                            message='Hồ sơ và điểm ELO của bạn đang được phụ huynh quanh khu vực '
                                    'quan tâm — bật thông báo để không lỡ ca tốt nhé!')
                        stats['notifications'] += 1

                    if not worker.is_approved:
                        continue  # chờ duyệt — nghiệp vụ chặn feed/booking, chỉ cần thông báo

                    # 4a. Ứng tuyển chờ duyệt (để nằm trong danh sách ứng viên)
                    if not TaskApplication.objects.filter(
                            worker=worker, status='pending').exists():
                        target = self._pick(open_tasks, idx)
                        if target is not None and not TaskApplication.objects.filter(
                                task=target, worker=worker).exists():
                            TaskApplication.objects.create(
                                task=target, worker=worker, status='pending')

                    # 4b. Booking Flow 1 theo kịch bản xoay vòng
                    if not Booking.objects.filter(carepartner=worker).exists():
                        if worker.username == 'worker_quynh':
                            scenario = 'cancelled_by_carepartner'  # khớp mô tả hồ sơ đã có kháng cáo
                        else:
                            scenario = scenarios[idx % len(scenarios)]
                        self._mk_booking_stack(worker, self._pick(parents, idx),
                                               cats, scenario, idx, now, today, stats)

                    # 4c. Quyết toán hoa hồng tháng
                    if not CommissionSettlement.objects.filter(worker=worker).exists():
                        last_month = 12 if now.month == 1 else now.month - 1
                        last_year = now.year - 1 if now.month == 1 else now.year
                        CommissionSettlement.objects.create(
                            worker=worker,
                            period_year=last_year, period_month=last_month,
                            total_tasks=1,
                            total_amount=D(str(60000 + (idx % 5) * 30000)),
                            task_ids=[], status='pending',
                            momo_order_id=f'settle_{last_year}_{last_month}_{worker.id}',
                            generated_at=now - timedelta(days=10))

                    # 4d. Lịch rảnh tối thiểu (cả 2 bảng) nếu chưa có
                    if not CarePartnerAvailability.objects.filter(
                            carepartner=worker).exists():
                        for wd, tf, tt in [(0, '17:00', '21:30'), (2, '17:00', '21:30'),
                                           (5, '08:00', '11:30')]:
                            h1, m1 = int(tf.split(':')[0]), int(tf.split(':')[1])
                            h2, m2 = int(tt.split(':')[0]), int(tt.split(':')[1])
                            CarePartnerAvailability.objects.get_or_create(
                                carepartner=worker, weekday=wd,
                                time_from=datetime.time(h1, m1),
                                time_to=datetime.time(h2, m2))
                            WorkerAvailability.objects.get_or_create(
                                worker=worker, weekday=wd + 1,
                                defaults={'start_time': tf, 'end_time': tt})
                stats['worker_stacks'] += 1
            except Exception as exc:  # noqa: BLE001
                stats['errors'] += 1
                self._log(f'   ! Bỏ qua CarePartner {worker.username}: {exc}')

        self._log(f"""
   PHỦ DỮ LIỆU HOÀN TẤT:
     • Phụ huynh được bổ sung stack đơn  : {stats['parent_stacks']}
     • CarePartner được bổ sung nghiệp vụ: {stats['worker_stacks']}
     • Cửa sổ chat mới                    : {stats['chats']}
     • Thanh toán mới                     : {stats['payments']}
     • Thông báo cá nhân mới              : {stats['notifications']}
     • Lỗi bỏ qua (không chặn deploy)     : {stats['errors']}
""")

    # ══════════════════════════════════════════════════════════════════
    # HELPERS
    # ══════════════════════════════════════════════════════════════════
    @staticmethod
    def _pick(pool, i):
        return pool[i % len(pool)] if pool else None

    TITLE_BANK = {
        'tutoring': [
            ('Gia sư Toán lớp 4 — 2 buổi/tuần',
             'Bé cần củng cố phần nhân chia và giải toán có lời văn, ưu tiên gia sư '
             'kiên nhẫn, hướng dẫn bé tự lập kế hoạch học tập mỗi buổi.'),
            ('Gia sư Tiếng Anh giao tiếp lớp 3 — cuối tuần',
             'Luyện phát âm và phản xạ giao tiếp qua trò chơi, bài hát tiếng Anh. '
             'Nhà có sẵn flashcard và bảng từ vựng cho bé.'),
            ('Gia sư Văn & Tập làm văn lớp 5',
             'Rèn kỹ năng viết đoạn văn miêu tả và tóm tắt bài học, kèm danh sách '
             'sách tham khảo phù hợp lứa tuổi.'),
        ],
        'childcare': [
            ('Đồng hành cùng bé 6 tuổi buổi sáng Thứ Bảy',
             'Chăm sóc bé 6 tuổi từ 08h00-11h30: cùng bé ôn bài tập tuần, chơi xếp '
             'hình và ăn xế. Bé học lớp 1, ngoan và thích kể chuyện.'),
            ('Đồng hành cùng bé 7 tuổi chiều Chủ Nhật',
             'Bố mẹ đi sự kiện, cần người cùng bé 7 tuổi đọc truyện, vẽ tranh và '
             'chơi cờ từ 14h-18h. Nhà có góc học tập riêng cho bé.'),
            ('Chăm sóc bé 8 tuổi sau giờ học',
             'Đón tiếp và chăm sóc bé 8 tuổi từ 17h-19h30: hướng dẫn bé làm bài tập '
             'về nhà, cho bé ăn tối nhẹ. Bé học lớp 3, tự giác cao.'),
        ],
        'pickup': [
            ('Đón bé tan trường Tiểu học Vĩnh Ninh về nhà',
             'Đón bé lúc 16h30 tại cổng trường Tiểu học Vĩnh Ninh, đưa về nhà an '
             'toàn, đội mũ bảo hiểm cho bé và báo phụ huynh khi về đến nơi.'),
            ('Đón bé tan lớp học Tiếng Anh buổi tối',
             'Đón bé tại trung tâm ngoại ngữ đường Trần Phú lúc 20h00, đưa về căn '
             'hộ an toàn. Quãng đường ngắn, đường quen thuộc.'),
        ],
    }

    PRICES = {'gia-su': [200000, 250000, 300000],
              'trong-tre': [220000, 250000, 200000],
              'don-tre': [120000, 100000, 150000],
              'tutoring': [200000, 250000, 300000],
              'childcare': [220000, 250000, 200000],
              'pickup': [120000, 100000, 150000]}

    @classmethod
    def _title_for(cls, cat, i):
        code = cat.code if cat is not None else 'childcare'
        if code == 'gia-su':
            return cls.TITLE_BANK['tutoring'][i % 3]
        if code == 'don-tre':
            return cls.TITLE_BANK['pickup'][i % 2]
        return cls.TITLE_BANK['childcare'][i % 3]

    def _mk_conversation(self, task, worker, now):
        """Cửa sổ chat + tin nhắn 2 chiều cho task (open nếu đang làm, closed nếu xong)."""
        Message = self._models['Message']
        Conversation = self._models['Conversation']
        if task.status == 'in_progress':
            conv = Conversation.objects.create(
                task=task, parent=task.parent, worker=worker, status='open',
                opens_at=now - timedelta(hours=1),
                closes_at=now + timedelta(hours=26))
            base = now
            msgs = [
                (task.parent, 'Chào em, ca làm bắt đầu sau 2 giờ. Gia đình đã chuẩn '
                              'bị sẵn bữa xế và góc học tập cho bé rồi nhé!', 45),
                (worker, 'Dạ em chào anh/chị ạ! Em sẽ có mặt trước giờ 10 phút và '
                         'cập nhật nhật ký chăm sóc cho bé đều đặn ạ.', 40),
                (worker, 'Em đã đến nơi an toàn, bé tiếp đón dễ thương quá ạ. '
                         'Anh/chị yên tâm nhé!', 12),
                (task.parent, 'Cảm ơn em nhiều! Có gì cần hỗ trợ thì nhắn ngay nhé.', 8),
            ]
        else:
            start = task.scheduled_time or (now - timedelta(days=3))
            conv = Conversation.objects.create(
                task=task, parent=task.parent, worker=worker, status='closed',
                opens_at=start - timedelta(hours=2),
                closes_at=start + timedelta(hours=24),
                closed_at=start + timedelta(hours=24))
            base = start
            msgs = [
                (worker, 'Em đã hoàn thành ca và bàn giao bé cho gia đình ạ. '
                         'Bé ngoan và hợp tác lắm ạ!', 120),
                (task.parent, 'Cảm ơn em nhiều nhé! Gia đình đã đánh giá và thanh '
                              'toán trên hệ thống rồi, hẹn em ca sau.', 110),
            ]
        for sender, text, min_ago in msgs:
            Message.objects.create(
                conversation=conv, sender=sender, content=text,
                read_at=base + timedelta(minutes=min_ago))
        return conv

    def _mk_payment(self, task, worker, now):
        """Payment đúng trạng thái task: pending / held / completed."""
        Payment = self._models['Payment']
        amt = D(str(task.price or 200000))
        comm = (amt * D('0.20')).quantize(D('1'))
        if task.status == 'pending_payment':
            Payment.objects.create(
                task=task, parent=task.parent, worker=worker,
                amount=amt, commission_rate=D('0.2000'),
                commission_amount=comm, worker_payout_amount=amt - comm,
                method='momo_escrow', status='pending',
                momo_order_id=f'EduCareLink_{task.id}_pending')
        elif task.status == 'in_progress':
            Payment.objects.create(
                task=task, parent=task.parent, worker=worker,
                amount=amt, commission_rate=D('0.2000'),
                commission_amount=comm, worker_payout_amount=amt - comm,
                method='momo_escrow', status='held',
                momo_order_id=f'EduCareLink_{task.id}_held',
                momo_trans_id=f'405{task.id:08d}',
                held_at=now - timedelta(hours=1))
        else:
            Payment.objects.create(
                task=task, parent=task.parent, worker=worker,
                amount=amt, commission_rate=D('0.2000'),
                commission_amount=comm, worker_payout_amount=amt - comm,
                method='cash', status='completed',
                completed_at=(task.scheduled_time or now - timedelta(days=2))
                             + timedelta(hours=3))

    def _mk_task_stack(self, parent, worker, second_worker, cats, status, i,
                       now, lat, lng, addr, stats):
        """Tạo 1 Task + application (+payment +chat +tracking +review tùy trạng thái)."""
        from tracking.models import LocationConsent, LiveLocation, DeviceHeartbeat

        cat = self._pick(cats, i) or self._pick(cats, 0)
        title, desc = self._title_for(cat, i)
        price_bank = self.PRICES.get(cat.code if cat else 'childcare', [220000, 250000, 200000])
        price = D(str(price_bank[i % len(price_bank)]))

        scheduled = {
            'open': now + timedelta(days=2 + i % 3),
            'pending_payment': now + timedelta(days=1 + i % 2),
            'in_progress': now + timedelta(hours=2),
            'completed': now - timedelta(days=3 + i % 4),
        }[status]

        needs_geo = status in ('in_progress', 'pending_payment')
        task = Task.objects.create(
            title=title, description=desc, price=price, category=cat,
            parent=parent, location=addr, latitude=lat, longitude=lng,
            status=status, scheduled_time=scheduled,
            geofence_lat=lat if needs_geo else None,
            geofence_lng=lng if needs_geo else None,
            geofence_radius=400 if needs_geo else None,
        )

        if status == 'open':
            # 2 ứng viên chờ phụ huynh duyệt (tránh trùng cùng 1 người)
            seen_pks = set()
            for w in (worker, second_worker):
                if w is None or w.pk in seen_pks:
                    continue
                seen_pks.add(w.pk)
                TaskApplication.objects.get_or_create(
                    task=task, worker=w, defaults={'status': 'pending'})
            return task

        if worker is None:
            return task
        TaskApplication.objects.get_or_create(
            task=task, worker=worker, defaults={'status': 'accepted'})

        if status == 'pending_payment':
            self._mk_payment(task, worker, now)
        elif status == 'in_progress':
            self._mk_payment(task, worker, now)
            LocationConsent.objects.get_or_create(
                task=task, worker=worker,
                defaults={'consent': 'granted', 'granted_at': now - timedelta(hours=1)})
            LiveLocation.objects.get_or_create(
                task=task, worker=worker,
                defaults={'latitude': D(str(lat)), 'longitude': D(str(lng)),
                          'accuracy': 5.0, 'speed': 0.0, 'heading': 90.0,
                          'is_outside_geofence': False})
            DeviceHeartbeat.objects.get_or_create(
                task=task, worker=worker,
                defaults={'last_seen': now - timedelta(seconds=15),
                          'last_location_lat': D(str(lat)),
                          'last_location_lng': D(str(lng)),
                          'device_status': 'online', 'battery_level': 85,
                          'app_state': 'foreground', 'network_type': 'wifi'})
            if not self._models['Conversation'].objects.filter(task=task).exists():
                self._mk_conversation(task, worker, now)
                stats['chats'] += 1
        else:  # completed — payment + review + chat đóng
            amt = D(str(task.price))
            comm = (amt * D('0.20')).quantize(D('1'))
            method = 'momo_escrow' if i % 2 == 0 else 'cash'
            pay_kwargs = dict(
                task=task, parent=parent, worker=worker,
                amount=amt, commission_rate=D('0.2000'),
                commission_amount=comm, worker_payout_amount=amt - comm,
                method=method, status='completed',
                completed_at=scheduled + timedelta(hours=3))
            if method == 'momo_escrow':
                pay_kwargs.update(
                    momo_order_id=f'EduCareLink_{task.id}_done',
                    momo_trans_id=f'405{task.id:08d}',
                    held_at=scheduled - timedelta(hours=2))
            self._models['Payment'].objects.create(**pay_kwargs)
            Review.objects.get_or_create(
                task=task,
                defaults={'reviewer': parent, 'reviewee': worker,
                          'rating': 5 if i % 3 else 4,
                          'comment': 'CarePartner đến đúng giờ, tận tâm với bé và '
                                     'cập nhật nhật ký đầy đủ. Gia đình rất an tâm '
                                     'và sẽ book lại ca sau!'})
            if not self._models['Conversation'].objects.filter(task=task).exists():
                self._mk_conversation(task, worker, now)
                stats['chats'] += 1
        return task

    def _mk_booking_stack(self, worker, parent, cats, scenario, i, now, today, stats):
        """Tạo 1 Booking Flow 1 như thật (+mirror task/payment/chat nếu đã bắt đầu)."""
        JobPost = self._models['JobPost']
        JobSlot = self._models['JobSlot']
        Booking = self._models['Booking']
        EloLedger = self._models['EloLedger']
        Appeal = self._models['Appeal']
        CreditTransaction = self._models['CreditTransaction']
        Payment = self._models['Payment']

        if parent is None:
            return None
        job_type = [JobPost.JobType.TUTORING, JobPost.JobType.CHILDCARE,
                    JobPost.JobType.PICKUP][i % 3]
        if job_type == JobPost.JobType.TUTORING:
            title, desc = self.TITLE_BANK['tutoring'][i % 3]
            rate = 150000
        elif job_type == JobPost.JobType.CHILDCARE:
            title, desc = self.TITLE_BANK['childcare'][i % 3]
            rate = 120000
        else:
            title, desc = self.TITLE_BANK['pickup'][i % 2]
            rate = 100000

        job_status = {
            'completed': 'completed', 'in_progress': 'closed',
            'committed': 'carepartner_selected',
            'awaiting_commitment': 'carepartner_selected',
            'no_show': 'needs_replacement',
            'cancelled_by_carepartner': 'closed',
        }[scenario]

        job = JobPost.objects.create(
            parent=parent, job_type=job_type, title=title, description=desc,
            hourly_rate_vnd=rate, status=job_status,
            latitude=parent.latitude or 16.4602,
            longitude=parent.longitude or 107.6008,
            location_note=parent.address or '48 Võ Thị Sáu, P. Vĩnh Ninh, TP. Huế',
            selected_carepartner=worker,
        )
        total_value = rate * 3

        if scenario in ('completed', 'in_progress'):
            slot_date = today - timedelta(days=2)
            slot_status = JobSlot.SlotStatus.DONE
        elif scenario in ('committed', 'awaiting_commitment'):
            slot_date = today + timedelta(days=1)
            slot_status = JobSlot.SlotStatus.LOCKED
        else:
            slot_date = today - timedelta(days=1)
            slot_status = JobSlot.SlotStatus.FREE
        JobSlot.objects.create(
            job=job, date=slot_date,
            time_from=datetime.time(17, 30), time_to=datetime.time(19, 30),
            status=slot_status)

        base = dict(
            job=job, carepartner=worker, parent=parent,
            selected_at=now - timedelta(days=2),
            commit_deadline=now - timedelta(days=2) + timedelta(hours=1),
            total_value_vnd=total_value)

        if scenario == 'awaiting_commitment':
            base.update(selected_at=now - timedelta(minutes=5),
                        commit_deadline=now + timedelta(minutes=25))
            Booking.objects.create(**base)
            return job

        if scenario == 'committed':
            base.update(committed_at=now - timedelta(minutes=90))
            Booking.objects.create(**base)
            return job

        # Kịch bản đã bắt đầu → mirror task + payment (+chat cho ca sống/xong)
        cat = self._pick(cats, i) or self._pick(cats, 0)
        t_status = 'completed' if scenario == 'completed' else (
            'cancelled' if scenario in ('no_show', 'cancelled_by_carepartner')
            else 'in_progress')
        task = Task.objects.create(
            title=title, description=desc,
            price=D(str(total_value)), category=cat, parent=parent,
            location=parent.address or '48 Võ Thị Sáu, P. Vĩnh Ninh, TP. Huế',
            latitude=parent.latitude or 16.4602,
            longitude=parent.longitude or 107.6008,
            status=t_status,
            scheduled_time=timezone.make_aware(
                datetime.datetime.combine(slot_date, datetime.time(17, 30))),
        )
        TaskApplication.objects.get_or_create(
            task=task, worker=worker, defaults={'status': 'accepted'})

        booking_kwargs = dict(base)
        booking_kwargs['task'] = task
        amt = D(str(total_value))
        comm = (amt * D('0.20')).quantize(D('1'))

        if scenario == 'completed':
            booking_kwargs.update(
                committed_at=now - timedelta(days=2) + timedelta(minutes=10),
                started_at=now - timedelta(days=2),
                ended_at=now - timedelta(days=2) + timedelta(hours=2),
                elo_delta_applied=20)
            booking = Booking.objects.create(**booking_kwargs)
            Payment.objects.get_or_create(
                task=task,
                defaults=dict(
                    task=task, parent=parent, worker=worker,
                    amount=amt, commission_rate=D('0.2000'),
                    commission_amount=comm, worker_payout_amount=amt - comm,
                    method='momo_escrow', status='completed',
                    momo_order_id=f'EduCareLink_{task.id}_done',
                    momo_trans_id=f'405{task.id:08d}',
                    held_at=now - timedelta(days=2) - timedelta(hours=2),
                    completed_at=now - timedelta(days=2) + timedelta(hours=3)))
            Review.objects.get_or_create(
                task=task,
                defaults={'reviewer': parent, 'reviewee': worker, 'rating': 5,
                          'comment': 'Hoàn thành ca xuất sắc, bé rất thích và đã '
                                     'yêu cầu book lại dài hạn!'})
            EloLedger.objects.create(
                carepartner=worker, booking=booking, delta=20,
                reason_code='job_completed', elo_before=1500, elo_after=1520,
                note='Hoàn thành xuất sắc ca ghép cặp Flow 1')
        elif scenario == 'in_progress':
            booking_kwargs.update(
                committed_at=now - timedelta(hours=2),
                started_at=now - timedelta(minutes=30))
            booking = Booking.objects.create(**booking_kwargs)
            Payment.objects.get_or_create(
                task=task,
                defaults=dict(
                    task=task, parent=parent, worker=worker,
                    amount=amt, commission_rate=D('0.2000'),
                    commission_amount=comm, worker_payout_amount=amt - comm,
                    method='momo_escrow', status='held',
                    momo_order_id=f'EduCareLink_{task.id}_held',
                    momo_trans_id=f'405{task.id:08d}',
                    held_at=now - timedelta(hours=1)))
        elif scenario == 'no_show':
            booking_kwargs.update(
                committed_at=now - timedelta(days=1, hours=4),
                started_at=now - timedelta(days=1, hours=2),
                compensation_vnd=50000, elo_delta_applied=-50,
                cancel_reason_code='other',
                cancelled_at=now - timedelta(days=1, hours=1),
                cancelled_by='system',
                cancel_note='CarePartner không đến sau 20 phút — hệ thống ghi nhận '
                            'no_show và đền bù phụ huynh theo quy chế T5.')
            booking = Booking.objects.create(**booking_kwargs)
            CreditTransaction.objects.get_or_create(
                parent=parent, kind='platform_credit',
                note__startswith='Đền bù no-show',
                defaults={'amount_vnd': 50000, 'status': 'issued',
                          'note': 'Đền bù no-show 50.000đ từ ví tín dụng nền tảng'})
            EloLedger.objects.create(
                carepartner=worker, booking=booking, delta=-50,
                reason_code='T5', elo_before=1500, elo_after=1450,
                note='T5 — Không đến làm việc, đền bù phụ huynh 50.000đ')
        else:  # cancelled_by_carepartner
            booking_kwargs.update(
                committed_at=now - timedelta(days=1, hours=5),
                compensation_vnd=120000, elo_delta_applied=-60,
                cancel_reason_code='broken_vehicle', cancel_class='normal_cancel',
                cancel_note='Bị hỏng xe giữa đường lúc 17h, không kịp đến điểm hẹn. '
                            'Đã báo phụ huynh ngay qua tin nhắn.',
                cancelled_at=now - timedelta(days=1, hours=1),
                cancelled_by='carepartner')
            booking = Booking.objects.create(**booking_kwargs)
            EloLedger.objects.create(
                carepartner=worker, booking=booking, delta=-60,
                reason_code='T3', elo_before=1500, elo_after=1440,
                note='Phạt T3 do hủy việc trước giờ làm 2 tiếng')
            Appeal.objects.get_or_create(
                booking=booking,
                defaults=dict(
                    carepartner=worker, reason_code='broken_vehicle',
                    note='Kính gửi Admin, em bị hỏng xe bất ngờ trên đường tới nhà '
                         'phụ huynh, có hóa đơn sửa xe kèm theo. Kính mong Admin xem '
                         'xét giảm trừ mức phạt ELO vì lý do bất khả kháng ạ.',
                    status='pending'))

        if t_status in ('in_progress', 'completed') and not \
                self._models['Conversation'].objects.filter(task=task).exists():
            self._mk_conversation(task, worker, now)
            stats['chats'] += 1
        return job
