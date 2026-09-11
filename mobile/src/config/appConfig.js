// ============================================================
// appConfig.js — Hằng số cấu hình ứng dụng dùng chung
// single source of truth cho thông tin liên hệ thương hiệu.
// Đổi hotline chỉ cần sửa 1 chỗ tại đây.
// ============================================================

export const APP_NAME = 'EduCareLink';

/** Hotline hỗ trợ khách hàng duy nhất của EduCareLink (đồng bộ web + mobile). */
export const SUPPORT_HOTLINE = '0862427404';

/** Mở trình quay số với hotline hỗ trợ (an toàn trên mọi nền tảng). */
export const openSupportHotline = async (LinkingModule) => {
  try {
    await LinkingModule.openURL(`tel:${SUPPORT_HOTLINE}`);
    return true;
  } catch (e) {
    return false;
  }
};
