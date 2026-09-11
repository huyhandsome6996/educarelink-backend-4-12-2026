// ============================================================
// mobile/src/utils/date.js — Date & Error utilities for EduCareLink Mobile
// Tránh lỗi chuyển đổi múi giờ khi dùng toISOString() khiến ngày
// ở múi giờ VN (GMT+7) bị lùi 1 ngày về hôm qua do chuyển sang UTC.
// ============================================================

/**
 * Chuyển đổi đối tượng Date hoặc string ngày sang định dạng chuẩn YYYY-MM-DD
 * theo múi giờ LOCAL của thiết bị.
 * @param {Date|string|number} date
 * @returns {string} 'YYYY-MM-DD'
 */
export const formatDateToYMD = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Lấy ngày hôm nay theo định dạng YYYY-MM-DD (local time)
 * @returns {string} 'YYYY-MM-DD'
 */
export const getTodayYMD = () => {
  return formatDateToYMD(new Date());
};

/**
 * Trích xuất thông điệp lỗi thân thiện từ phản hồi API (DRF/Axios)
 * @param {any} err
 * @param {string} fallback
 * @returns {string}
 */
export const extractErrorMessage = (err, fallback = 'Không thể thực hiện. Vui lòng kiểm tra lại thông tin.') => {
  if (!err) return fallback;

  // Lỗi timeout (Axios abort khi quá hạn chờ, thường do AI phân tích lâu)
  if (err.code === 'ECONNABORTED' || (err.message && err.message.toLowerCase().includes('timeout'))) {
    return 'Thời gian xử lý quá hạn (hệ thống AI đang phân tích). Vui lòng thử lại hoặc vào danh sách công việc để kiểm tra.';
  }

  // Lỗi mạng hoặc máy chủ không thể tiếp cận
  if (err.message === 'Network Error' || (err.message && err.message.toLowerCase().includes('network error'))) {
    return 'Lỗi kết nối mạng: Không thể kết nối tới máy chủ. Vui lòng kiểm tra lại đường truyền Wi-Fi/4G và thử lại.';
  }

  const status = err.response?.status;
  if (status === 401) {
    return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  }
  if (status === 502 || status === 503 || status === 504) {
    return 'Máy chủ đang khởi động hoặc tạm bận. Vui lòng thử lại sau ít phút.';
  }
  if (status >= 500) {
    return 'Lỗi máy chủ nội bộ. Vui lòng thử lại sau giây lát.';
  }

  const data = err?.response?.data;
  if (!data) return err?.message || fallback;
  if (typeof data === 'string') return data;
  if (typeof data.detail === 'string') return data.detail;
  if (data.detail && typeof data.detail === 'object') {
    const firstKey = Object.keys(data.detail)[0];
    const val = data.detail[firstKey];
    if (Array.isArray(val) && val.length > 0) return `${val[0]}`;
    if (typeof val === 'string') return val;
    return JSON.stringify(data.detail);
  }
  if (typeof data.message === 'string') return data.message;
  const keys = Object.keys(data);
  if (keys.length > 0 && keys[0] !== 'code') {
    const val = data[keys[0]];
    if (Array.isArray(val) && val.length > 0) return `${val[0]}`;
    if (typeof val === 'string') return `${val}`;
  }
  return fallback;
};
