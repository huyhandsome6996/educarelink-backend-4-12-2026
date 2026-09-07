"""
matching/serializers.py — Serializer cho availability / blackout / credit / trust.

QUY TẮC Step 6.7: KHÔNG BAO GIỜ serializer nào chứa điểm ELO ẩn hoặc điểm
hiệu quả (tên field cấm định nghĩa trong matching/services/elo_service.py) —
có test grep CI (matching/tests/test_elo.py::test_no_elo_leak_in_serializers).
"""

from datetime import time as dtime

from rest_framework import serializers

from .models import (
    CarePartnerAvailability,
    CarePartnerBlackout,
    CreditBalance,
    CreditTransaction,
)


class AvailabilityWindowSerializer(serializers.ModelSerializer):
    """Field name chuẩn spec: time_from / time_to (Step 4).

    Hỗ trợ input window cắt nửa đêm (22:00 → 01:00): tự tách 2 row khi lưu
    (Step 9.3). Response trả từng row như spec.
    """

    class Meta:
        model = CarePartnerAvailability
        fields = ['id', 'weekday', 'time_from', 'time_to']
        read_only_fields = ['id']

    def validate(self, attrs):
        tf, tt = attrs.get('time_from'), attrs.get('time_to')
        if tf == tt:
            raise serializers.ValidationError(
                {'time_to': 'Giờ kết thúc phải khác giờ bắt đầu.'})
        # Window cắt nửa đêm cho phép (tf > tt) — service tách 2 row
        return attrs


class AvailabilityBulkSerializer(serializers.Serializer):
    """PUT /api/carepartners/me/availability/bulk — thay toàn bộ lịch tuần."""

    windows = AvailabilityWindowSerializer(many=True)


class BlackoutSerializer(serializers.ModelSerializer):
    class Meta:
        model = CarePartnerBlackout
        fields = ['id', 'date', 'time_from', 'time_to', 'reason', 'note', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate(self, attrs):
        tf, tt = attrs.get('time_from'), attrs.get('time_to')
        if (tf is None) != (tt is None):
            raise serializers.ValidationError(
                {'time_to': 'Chọn hoặc cả 2 giờ, hoặc để trống để khai bận cả ngày.'})
        if tf and tt and tf >= tt:
            raise serializers.ValidationError(
                {'time_to': 'Giờ kết thúc phải sau giờ bắt đầu.'})
        return attrs


class CreditTransactionSerializer(serializers.ModelSerializer):
    booking_id = serializers.CharField(source='booking_id', read_only=True, default=None)

    class Meta:
        model = CreditTransaction
        fields = ['id', 'booking_id', 'amount_vnd', 'kind', 'status', 'issued_at', 'note']


class CreditBalanceSerializer(serializers.ModelSerializer):
    history = CreditTransactionSerializer(many=True, read_only=True)

    class Meta:
        model = CreditBalance
        fields = ['credit_vnd', 'updated_at', 'history']


class TrustEventSerializer(serializers.Serializer):
    """Sự kiện tín nhiệm — CHỈ mô tả tiếng Việt, KHÔNG số (Step 6.7)."""

    description_vi = serializers.CharField()
    when = serializers.DateTimeField()
    kind = serializers.CharField(help_text='reward | penalty')


# Bảng mô tả sự kiện KHÔNG SỐ (Step 6.7) — reason_code → mô tả
TRUST_EVENT_DESCRIPTIONS_VI = {
    'job_completed': 'Hoàn thành công việc đúng cam kết',
    'review_5': 'Nhận đánh giá 5 sao',
    'review_4': 'Nhận đánh giá tốt',
    'review_3': 'Nhận đánh giá trung bình',
    'review_bad': 'Nhận đánh giá kém',
    'positive_review_text': 'Nhận được nhận xét tích cực từ phụ huynh',
    'streak_3': 'Chuỗi 3 đơn hoàn thành liên tiếp',
    'streak_5': 'Chuỗi 5 đơn hoàn thành liên tiếp',
    'streak_10': 'Chuỗi 10 đơn hoàn thành liên tiếp',
    'clean_month': 'Một tháng không hủy đơn nào',
    'profile_complete': 'Hoàn thiện hồ sơ CarePartner',
    'fast_ack': 'Xác nhận đơn nhanh trong 5 phút',
    'reschedule_ok': 'Đổi giờ được phụ huynh đồng ý',
    'parent_cancelled_compensation': 'Phụ huynh hủy đơn — bạn không bị trừ điểm',
    'slow_ack_repeat': 'Xác nhận đơn chậm nhiều lần',
    'parent_report_valid': 'Báo cáo từ phụ huynh được xác nhận',
    'appeal_abuse': 'Kháng cáo vượt giới hạn',
    'appeal_approved': 'Kháng cáo thành công',
    'admin_adjust': 'Điều chỉnh từ quản trị viên',
    'T0': 'Từ chối đơn trong thời hạn cho phép',
    'T1': 'Hủy đơn báo trước hơn 24 giờ',
    'T2': 'Hủy đơn báo trước 6-24 giờ',
    'T3': 'Hủy đơn báo trước 3-6 giờ',
    'T4': 'Hủy đơn sát giờ (dưới 3 giờ)',
    'T5': 'Không đến làm việc',
    'T6': 'Vi phạm nghiêm trọng chính sách',
}
