// ============================================================
// workerScreeningMock — dữ liệu mẫu cho WorkerScreeningStatusScreen (Nhóm B)
// Backend đã có field trạng thái duyệt hồ sơ (CredentialSubmission.status)
// nhưng chưa có API endpoint riêng tổng hợp screening → dùng mock tạm.
//
// Khi có API:
//   import { getScreeningStatus } from '../api/screening';
//   const [status, setStatus] = useState(null);
//   useEffect(() => { getScreeningStatus().then(r => setStatus(r.data)); }, []);
//
// Hoặc đối chiếu trực tiếp từ user (useAuth):
//   - user.is_verified === true  → stage = 'Đã duyệt', tất cả steps = done
//   - user.is_verified === false → stage = 'Đang thẩm định', steps theo mock
// ============================================================

export const MOCK_SCREENING_STATUS = {
  stage: 'Phỏng vấn trực tuyến',
  estimatedHours: '24-48h làm việc',
  description: 'EduCareLink đang rà soát thông tin của bạn. Kết quả sẽ có sau 24-48h làm việc.',
  steps: [
    { id: 1, label: 'Xác minh danh tính (ID)', status: 'done' },
    { id: 2, label: 'Xác thực khuôn mặt', status: 'done' },
    { id: 3, label: 'Khám sức khỏe cơ bản', status: 'done' },
    { id: 4, label: 'Phỏng vấn chuyên môn', status: 'pending' },
    { id: 5, label: 'Duyệt hồ sơ cuối', status: 'pending' },
  ],
  submittedDate: '15/05/2024',
  expectedDate: '17/05/2024',
};

// Variant cho worker đã duyệt — dùng khi user.is_verified === true
export const APPROVED_SCREENING_STATUS = {
  stage: 'Đã duyệt',
  estimatedHours: 'Hoàn tất',
  description: 'Hồ sơ của bạn đã được EduCareLink phê duyệt. Bạn có thể bắt đầu nhận việc ngay bây giờ.',
  steps: [
    { id: 1, label: 'Xác minh danh tính (ID)', status: 'done' },
    { id: 2, label: 'Xác thực khuôn mặt', status: 'done' },
    { id: 3, label: 'Khám sức khỏe cơ bản', status: 'done' },
    { id: 4, label: 'Phỏng vấn chuyên môn', status: 'done' },
    { id: 5, label: 'Duyệt hồ sơ cuối', status: 'done' },
  ],
  submittedDate: '15/05/2024',
  expectedDate: '17/05/2024',
};

export default MOCK_SCREENING_STATUS;
