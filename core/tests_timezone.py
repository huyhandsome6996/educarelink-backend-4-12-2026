# -*- coding: utf-8 -*-
"""Kiểm thử hiển thị giờ Việt Nam (Asia/Ho_Chi_Minh) — bug lệch 7 giờ 2026-09-16.

Bối cảnh: DB lưu UTC (USE_TZ = True). Người dùng tại Việt Nam báo dashboard
hiện giờ khảo sát lệch 7 tiếng (điền lúc 10:48 sáng giờ VN nhưng dashboard
in "03:48"). Nguyên nhân: nhiều điểm hiển thị gọi .strftime() thẳng trên
datetime ORM (aware UTC) thay vì quy đổi về TIME_ZONE trước.

Các test này khoá hành vi ĐÚNG:
1. fmt_vn() quy đổi UTC → giờ VN, kể cả qua mốc nửa đêm (không trôi ngày);
2. Bảng khảo sát & đăng ký trên dashboard trả giờ VN dạng 'dd/mm/YYYY HH:MM';
3. Báo cáo Excel xuất giờ VN, không còn chuỗi giờ UTC thô.
Lưu ý: chỉ sửa LỚP HIỂN THỊ — dữ liệu trong DB vẫn giữ chuẩn UTC.
"""
import datetime

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from .models import LandingSurvey, LandingSignup, User
from .time_utils import fmt_vn

UTC = datetime.timezone.utc


class FmtVnTests(TestCase):
    """Unit test helper fmt_vn — quy đổi UTC → giờ Việt Nam trước khi format."""

    def test_none_va_rong_tra_ve_chuoi_rong(self):
        self.assertEqual(fmt_vn(None), '')
        self.assertEqual(fmt_vn(''), '')

    def test_aware_utc_doi_sang_gio_vn(self):
        # 03:48 UTC → 10:48 giờ VN (cùng ngày)
        dt = datetime.datetime(2026, 9, 16, 3, 48, tzinfo=UTC)
        self.assertEqual(fmt_vn(dt), '16/09/2026 10:48')

    def test_aware_utc_qua_moc_nua_dem_khong_troi_ngay(self):
        # 20:48 UTC ngày 15/09 → 03:48 giờ VN ngày 16/09 (phải sang ngày mới)
        dt = datetime.datetime(2026, 9, 15, 20, 48, tzinfo=UTC)
        self.assertEqual(fmt_vn(dt), '16/09/2026 03:48')

    def test_dinh_dang_tuy_chinh(self):
        dt = datetime.datetime(2026, 9, 16, 3, 48, tzinfo=UTC)
        self.assertEqual(fmt_vn(dt, '%Y-%m-%d %H:%M'), '2026-09-16 10:48')
        self.assertEqual(fmt_vn(dt, '%d/%m/%Y'), '16/09/2026')

    def test_naive_giu_nguyen_khong_tu_doan_mui_gio(self):
        dt = datetime.datetime(2026, 9, 16, 10, 48)  # naive — format nguyên trạng
        self.assertEqual(fmt_vn(dt), '16/09/2026 10:48')


class DashboardTimeDisplayTests(TestCase):
    """Dashboard admin phải hiển thị giờ Việt Nam cho khảo sát & đăng ký."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(
            username='tz_admin', email='tz_admin@test.com', password='testpass123'
        )

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        resp = self.client.post(
            '/api/auth/login/',
            {'username': 'tz_admin', 'password': 'testpass123'},
        )
        token = (resp.data.get('tokens', {}) or {}).get('access') or resp.data.get('access')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    @staticmethod
    def _tao_survey_gio_utc(dt):
        """Tạo khảo sát rồi đặt created_at = dt (update bỏ qua auto_now_add)."""
        s = LandingSurvey.objects.create(
            role='phu-huynh',
            full_name='Kiểm Thử Giờ VN',
            phone='0900000000',
            email='kiemthu@test.com',
            feedback='Bản ghi phục vụ test múi giờ',
        )
        LandingSurvey.objects.filter(pk=s.pk).update(created_at=dt)
        s.refresh_from_db()
        return s

    def _tao_signup_gio_utc(self, dt):
        sg = LandingSignup.objects.create(
            full_name='Kiểm Thử Giờ VN',
            phone='0900000000',
            email='kiemthu@test.com',
            role='phu-huynh',
            signup_type='tu-van',
        )
        LandingSignup.objects.filter(pk=sg.pk).update(created_at=dt)
        sg.refresh_from_db()
        return sg

    # Mốc thử: 20:48 UTC 15/09 = 03:48 giờ VN 16/09 (vừa kiểm tra +7h, vừa
    # kiểm tra trôi ngày qua nửa đêm — đúng tình huống lỗi trong screenshot)
    UTC_MOC = datetime.datetime(2026, 9, 15, 20, 48, tzinfo=UTC)
    GIO_VN_MONG_DOI = '16/09/2026 03:48'

    def test_bang_khao_sat_hien_gio_vn(self):
        s = self._tao_survey_gio_utc(self.UTC_MOC)
        resp = self.client.get('/api/admin/feedback-stats/?days=365')
        self.assertEqual(resp.status_code, 200)
        row = next(r for r in resp.data['surveys']['all'] if r['id'] == s.pk)
        self.assertEqual(row['created_at'], self.GIO_VN_MONG_DOI)
        # Chặn hồi quy: không được in lại giờ UTC thô
        self.assertNotIn('15/09/2026 20:48', row['created_at'])

    def test_bang_dang_ky_hien_gio_vn(self):
        sg = self._tao_signup_gio_utc(self.UTC_MOC)
        resp = self.client.get('/api/admin/feedback-stats/?days=365')
        self.assertEqual(resp.status_code, 200)
        row = next(r for r in resp.data['signups']['all'] if r['id'] == sg.pk)
        self.assertEqual(row['created_at'], self.GIO_VN_MONG_DOI)

    def test_bao_cao_excel_xuat_gio_vn(self):
        s = self._tao_survey_gio_utc(self.UTC_MOC)
        resp = self.client.get('/api/admin/feedback-excel/?days=365')
        self.assertEqual(resp.status_code, 200)

        import openpyxl
        from io import BytesIO
        wb = openpyxl.load_workbook(BytesIO(resp.content))
        all_cells = ' | '.join(
            str(cell.value)
            for ws in wb.worksheets
            for row in ws.iter_rows()
            for cell in row
            if cell.value is not None
        )
        # Giờ VN (16/09 03:48) phải xuất hiện trong sheet Góp ý
        self.assertIn('2026-09-16 03:48', all_cells)
        # Giờ UTC thô (15/09 20:48) không được xuất hiện ở bất kỳ đâu
        self.assertNotIn('2026-09-15 20:48', all_cells)

    def test_khao_sat_moi_cung_hien_gio_vn(self):
        """Khảo sát tạo 'bây giờ' (từ giờ trở về sau) phải hiện đúng giờ VN hiện tại."""
        s = LandingSurvey.objects.create(
            role='carepartner', full_name='Mới Điền', phone='0900000001')
        resp = self.client.get('/api/admin/feedback-stats/?days=365')
        self.assertEqual(resp.status_code, 200)
        row = next(r for r in resp.data['surveys']['all'] if r['id'] == s.pk)

        from django.utils import timezone
        gio_vn_hien_tai = timezone.localtime(s.created_at)
        self.assertEqual(
            row['created_at'],
            gio_vn_hien_tai.strftime('%d/%m/%Y %H:%M'),
        )
