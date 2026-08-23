"""B4 — API admin set/recompute hạng + overrides views gắn tier.

Các class *APIView bên dưới thay thế bản trong core.views (urls trỏ về đây)
để trả/tính hạng CarePartner mà không rewrite cả views.py.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
import logging
from django.utils import timezone

logger = logging.getLogger(__name__)

from .models import User, Review, CredentialSubmission, Notification, TaskApplication

# B4 — Validate ảnh minh chứng bằng cấp khi upload (WorkerSubmitCredentialAPIView)
# Dự án chưa có helper validate upload dùng chung (id_card_front/id_card_back trên
# RegisterAPIView cũng chỉ check sự tồn tại) → định nghĩa hằng + hàm kiểm tra tại đây,
# theo convention §15.4 (UPPER_SNAKE) + §15.6 (error message tiếng Việt).
ALLOWED_CREDENTIAL_IMAGE_TYPES = ('image/jpeg', 'image/png', 'image/webp')
MAX_CREDENTIAL_IMAGE_SIZE_MB = 5
MAX_CREDENTIAL_IMAGE_SIZE = MAX_CREDENTIAL_IMAGE_SIZE_MB * 1024 * 1024


def validate_credential_image(file):
    """Kiểm tra MIME type + dung lượng ảnh minh chứng. Trả None nếu hợp lệ,
    ngược lại trả (error_message, status_code) cho view trả về 400."""
    if file.content_type not in ALLOWED_CREDENTIAL_IMAGE_TYPES:
        return (
            'Ảnh bằng cấp không hợp lệ. Chỉ nhận định dạng JPEG, PNG hoặc WebP.',
            status.HTTP_400_BAD_REQUEST,
        )
    if file.size is not None and file.size > MAX_CREDENTIAL_IMAGE_SIZE:
        return (
            f'Ảnh bằng cấp quá lớn (tối đa {MAX_CREDENTIAL_IMAGE_SIZE_MB}MB).',
            status.HTTP_400_BAD_REQUEST,
        )
    return None


def build_absolute_uri(request, path):
    if not path:
        return None
    try:
        return request.build_absolute_uri(path)
    except Exception:
        return path


def send_expo_push_notification(*, token, title, body, data=None):
    """Soft-import helper từ views gốc nếu có; fallback no-op."""
    try:
        from core.views import send_expo_push_notification as _send
        return _send(token=token, title=title, body=body, data=data or {})
    except Exception:
        return None


class AdminSetWorkerTierAPIView(APIView):
    """Admin set hạng thủ công (bật tier_override). Body: {\"tier\": \"silver\"}"""
    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        from core.services.tier_service import set_tier_manual, tier_label
        tier = (request.data.get('tier') or '').strip().lower()
        try:
            worker = User.objects.get(id=user_id, role='worker')
        except User.DoesNotExist:
            return Response({'error': 'Không tìm thấy CarePartner.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            set_tier_manual(worker, tier, actor=request.user)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'message': f'Đã set hạng {tier_label(tier)} cho {worker.username}.',
            'tier': worker.tier,
            'tier_label': tier_label(worker.tier),
            'tier_override': True,
        })


class AdminRecomputeWorkerTierAPIView(APIView):
    """Admin tính lại hạng theo rule (bỏ override)."""
    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        from core.services.tier_service import refresh_tier, tier_label
        try:
            worker = User.objects.get(id=user_id, role='worker')
        except User.DoesNotExist:
            return Response({'error': 'Không tìm thấy CarePartner.'}, status=status.HTTP_404_NOT_FOUND)
        new_tier = refresh_tier(worker, force=True)
        worker.refresh_from_db()
        return Response({
            'message': f'Đã tính lại hạng cho {worker.username}.',
            'tier': new_tier,
            'tier_label': tier_label(new_tier),
            'tier_meta': worker.tier_meta,
            'tier_override': False,
        })


class WorkerProfileDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, worker_id):
        try:
            worker = User.objects.get(id=worker_id, role='worker')
            reviews = Review.objects.select_related('reviewer').filter(reviewee=worker).order_by('-created_at')[:50]
            from django.db.models import Avg, Count
            stats = Review.objects.filter(reviewee=worker).aggregate(
                avg_rating=Avg('rating'),
                review_count=Count('id')
            )
            avg_rating = round(stats['avg_rating'], 1) if stats['avg_rating'] else 0.0
            review_count = stats['review_count'] or 0
            qualifications = worker.qualifications if isinstance(worker.qualifications, list) else []
            serialized_reviews = []
            for r in reviews:
                serialized_reviews.append({
                    'id': r.id,
                    'rating': r.rating,
                    'comment': r.comment,
                    'reviewer_username': r.reviewer.username,
                    'reviewer_name': f'{r.reviewer.first_name} {r.reviewer.last_name}'.strip() or r.reviewer.username,
                    'created_at': r.created_at.strftime('%d/%m/%Y'),
                })
            from core.services.tier_service import tier_label
            data = {
                'id': worker.id,
                'username': worker.username,
                'first_name': worker.first_name,
                'last_name': worker.last_name,
                'is_verified': worker.is_verified,
                'is_approved': worker.is_approved,
                'tier': getattr(worker, 'tier', 'bronze') or 'bronze',
                'tier_label': tier_label(getattr(worker, 'tier', None) or 'bronze'),
                'tier_meta': getattr(worker, 'tier_meta', {}) or {},
                'ai_profile_summary': worker.ai_profile_summary or 'Chưa có nhận xét từ AI.',
                'avg_rating': avg_rating,
                'review_count': review_count,
                'qualifications': qualifications,
                'reviews': serialized_reviews,
                'phone_number': worker.phone_number or '',
                'address': worker.address or '',
                'email': worker.email or '',
            }
            return Response(data, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({'error': 'Không tìm thấy hồ sơ Carepartner.'}, status=status.HTTP_404_NOT_FOUND)


class AdminApproveWorkerAPIView(APIView):
    """API duyệt hoặc từ chối tài khoản Carepartner"""
    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        action = request.data.get('action')
        qualifications = request.data.get('qualifications', [])
        try:
            worker = User.objects.get(id=user_id, role='worker')
            if action == 'approve':
                worker.is_approved = True
                worker.is_verified = True
                if isinstance(qualifications, list) and len(qualifications) > 0:
                    worker.qualifications = qualifications
                worker.tier = User.CarePartnerTier.BRONZE
                worker.tier_override = False
                worker.save()
                from core.services.tier_service import refresh_tier
                refresh_tier(worker, force=True)
                return Response({
                    'message': f'Đã duyệt tài khoản {worker.username}.',
                    'tier': worker.tier,
                    'tier_label': worker.get_tier_display(),
                })
            elif action == 'reject':
                worker.is_approved = False
                worker.is_active = False
                worker.save()
                return Response({'message': f'Đã từ chối tài khoản {worker.username}.'})
            elif action == 'update_qualifications':
                if isinstance(qualifications, list):
                    worker.qualifications = qualifications
                    worker.save()
                    return Response({'message': f'Đã cập nhật bằng cấp cho {worker.username}.'})
                return Response({'error': 'Danh sách bằng cấp không hợp lệ.'}, status=400)
            else:
                return Response({'error': 'Action không hợp lệ.'}, status=400)
        except User.DoesNotExist:
            return Response({'error': 'Không tìm thấy tài khoản.'}, status=404)


class AdminAllWorkersAPIView(APIView):
    """API lấy tất cả Carepartner (đã duyệt + chờ duyệt)"""
    permission_classes = [IsAdminUser]

    def get(self, request):
        workers = User.objects.filter(role='worker').order_by('-date_joined')
        data = []
        from core.services.tier_service import tier_label
        for u in workers:
            data.append({
                'id': u.id,
                'username': u.username,
                'first_name': u.first_name,
                'last_name': u.last_name,
                'email': u.email,
                'phone_number': u.phone_number,
                'is_approved': u.is_approved,
                'tier': getattr(u, 'tier', 'bronze') or 'bronze',
                'tier_label': tier_label(getattr(u, 'tier', None) or 'bronze'),
                'tier_override': getattr(u, 'tier_override', False),
                'date_joined': u.date_joined.strftime('%d/%m/%Y %H:%M'),
                'id_card_front': build_absolute_uri(request, u.id_card_front.url) if u.id_card_front else None,
                'id_card_back': build_absolute_uri(request, u.id_card_back.url) if u.id_card_back else None,
                'selfie_photo': build_absolute_uri(request, u.selfie_photo.url) if u.selfie_photo else None,
                'certificate_photo': build_absolute_uri(request, u.certificate_photo.url) if u.certificate_photo else None,
                'qualifications': u.qualifications if isinstance(u.qualifications, list) else [],
            })
        return Response(data)


class WorkerSubmitCredentialAPIView(APIView):
    """API cho Carepartner gửi ảnh minh chứng + mô tả bằng cấp cho Admin duyệt"""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        if request.user.role != 'worker':
            return Response({'error': 'Chỉ Carepartner mới được gửi bằng cấp.'}, status=status.HTTP_403_FORBIDDEN)
        certificate_photo = request.FILES.get('certificate_photo')
        description = request.data.get('description', '').strip()
        if not certificate_photo and not description:
            return Response({'error': 'Vui lòng tải lên ảnh hoặc viết mô tả về bằng cấp.'}, status=status.HTTP_400_BAD_REQUEST)
        # B4 — chặn file sai định dạng/quá nặng TRƯỚC khi lưu vào storage
        if certificate_photo:
            invalid = validate_credential_image(certificate_photo)
            if invalid:
                return Response({'error': invalid[0]}, status=invalid[1])
        submission = CredentialSubmission.objects.create(
            worker=request.user,
            certificate_photo=certificate_photo if certificate_photo else None,
            description=description if description else None,
            credential_type=request.data.get('credential_type') or 'certificate',
            title=(request.data.get('title') or '').strip(),
            field=(request.data.get('field') or '').strip(),
            status='pending',
        )
        return Response({
            'message': 'Đã gửi bằng cấp thành công! Vui lòng đợi Admin duyệt.',
            'submission': {
                'id': submission.id,
                'certificate_photo': build_absolute_uri(request, submission.certificate_photo.url) if submission.certificate_photo else None,
                'description': submission.description,
                'status': submission.status,
                'created_at': submission.created_at.isoformat(),
            }
        }, status=status.HTTP_201_CREATED)

    def get(self, request):
        if request.user.role != 'worker':
            return Response({'error': 'Chỉ Carepartner mới có danh sách bằng cấp.'}, status=status.HTTP_403_FORBIDDEN)
        submissions = CredentialSubmission.objects.filter(worker=request.user).order_by('-created_at')
        data = []
        for s in submissions:
            data.append({
                'id': s.id,
                'certificate_photo': build_absolute_uri(request, s.certificate_photo.url) if s.certificate_photo else None,
                'description': s.description,
                'status': s.status,
                'status_display': s.get_status_display(),
                'admin_review': s.admin_review,
                'reviewed_at': s.reviewed_at.isoformat() if s.reviewed_at else None,
                'created_at': s.created_at.isoformat(),
            })
        return Response(data)


class AdminReviewCredentialAPIView(APIView):
    """API cho Admin duyệt/từ chối + viết đánh giá bằng cấp cho Carepartner"""
    permission_classes = [IsAdminUser]

    def post(self, request, submission_id):
        try:
            submission = CredentialSubmission.objects.get(id=submission_id)
        except CredentialSubmission.DoesNotExist:
            return Response({'error': 'Không tìm thấy yêu cầu gửi bằng cấp.'}, status=status.HTTP_404_NOT_FOUND)

        action = request.data.get('action')
        admin_review = request.data.get('admin_review', '').strip()
        qualifications_update = request.data.get('qualifications', [])

        if action == 'approve':
            submission.status = 'approved'
            submission.admin_review = admin_review if admin_review else 'Bằng cấp đã được xác nhận bởi Admin.'
            submission.reviewed_at = timezone.now()
            submission.save()

            worker = submission.worker
            is_upgrade = '[NÂNG CẤP]' in (submission.description or '')

            if is_upgrade:
                worker.role = 'worker'
                worker.is_approved = True
                worker.is_verified = True
                worker.tier = User.CarePartnerTier.BRONZE
                worker.tier_override = False
                worker.save(update_fields=['role', 'is_approved', 'is_verified', 'tier', 'tier_override'])
                logger.info('[Upgrade] %s upgraded to Carepartner by admin', worker.username)
            else:
                if not worker.is_verified:
                    worker.is_verified = True
                    worker.save(update_fields=['is_verified'])

            if isinstance(qualifications_update, list) and len(qualifications_update) > 0:
                existing_quals = worker.qualifications if isinstance(worker.qualifications, list) else []
                for q in qualifications_update:
                    if q and q not in existing_quals:
                        existing_quals.append(q)
                worker.qualifications = existing_quals
                worker.save(update_fields=['qualifications'])

            if is_upgrade:
                Notification.objects.create(
                    recipient=worker,
                    title='Đã được duyệt làm Carepartner!',
                    message=f'Chúc mừng! Admin đã duyệt hồ sơ nâng cấp của bạn. Bạn nay đã là Carepartner. {submission.admin_review}',
                )
                if worker.expo_push_token:
                    send_expo_push_notification(
                        token=worker.expo_push_token,
                        title='Đã được duyệt làm Carepartner!',
                        body='Admin đã duyệt hồ sơ nâng cấp của bạn.',
                        data={'type': 'upgrade_approved'},
                    )
            else:
                Notification.objects.create(
                    recipient=worker,
                    title='Bằng cấp đã được duyệt!',
                    message=f'Admin đã duyệt bằng cấp của bạn. {submission.admin_review}',
                )
                if worker.expo_push_token:
                    send_expo_push_notification(
                        token=worker.expo_push_token,
                        title='Bằng cấp đã được duyệt!',
                        body='Admin đã duyệt bằng cấp của bạn.',
                        data={'type': 'credential_approved'},
                    )

            is_specialized = request.data.get('is_specialized', None)
            if is_specialized is not None:
                if isinstance(is_specialized, str):
                    submission.is_specialized = is_specialized.lower() in ('1', 'true', 'yes')
                else:
                    submission.is_specialized = bool(is_specialized)
                submission.save(update_fields=['is_specialized'])
            for opt_field in ('credential_type', 'title', 'field'):
                if opt_field in request.data and request.data.get(opt_field) is not None:
                    setattr(submission, opt_field, request.data.get(opt_field))
                    submission.save(update_fields=[opt_field])

            from core.services.tier_service import refresh_tier
            refresh_tier(worker, force=False)
            worker.refresh_from_db()

            return Response({
                'message': f'Đã duyệt bằng cấp cho {worker.username}.',
                'tier': worker.tier,
                'tier_label': worker.get_tier_display(),
                'is_specialized': submission.is_specialized,
            })

        elif action == 'reject':
            submission.status = 'rejected'
            is_upgrade = '[NÂNG CẤP]' in (submission.description or '')
            submission.admin_review = admin_review if admin_review else (
                'Hồ sơ nâng cấp không đạt yêu cầu.' if is_upgrade else 'Bằng cấp không đạt yêu cầu.'
            )
            submission.reviewed_at = timezone.now()
            submission.save()

            if is_upgrade:
                Notification.objects.create(
                    recipient=submission.worker,
                    title='Yêu cầu nâng cấp bị từ chối',
                    message=f'Admin đã từ chối hồ sơ nâng cấp Carepartner của bạn. Lý do: {submission.admin_review}',
                )
                if submission.worker.expo_push_token:
                    send_expo_push_notification(
                        token=submission.worker.expo_push_token,
                        title='Yêu cầu nâng cấp bị từ chối',
                        body='Admin đã từ chối hồ sơ nâng cấp của bạn.',
                        data={'type': 'upgrade_rejected'},
                    )
            else:
                Notification.objects.create(
                    recipient=submission.worker,
                    title='Bằng cấp bị từ chối',
                    message=f'Admin đã từ chối bằng cấp của bạn. Lý do: {submission.admin_review}',
                )
                if submission.worker.expo_push_token:
                    send_expo_push_notification(
                        token=submission.worker.expo_push_token,
                        title='Bằng cấp bị từ chối',
                        body='Admin đã từ chối bằng cấp của bạn.',
                        data={'type': 'credential_rejected'},
                    )

            return Response({'message': f'Đã từ chối bằng cấp của {submission.worker.username}.'})

        else:
            return Response(
                {'error': 'Action không hợp lệ. Dùng approve hoặc reject.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
