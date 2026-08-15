// ============================================================
// careDiaryMock — dữ liệu mẫu cho CareDiaryDetailScreen (Nhóm B)
// Backend chưa có model "Care Diary" — khi có API, thay bằng:
//   import { getCareDiary } from '../api/careDiary';
//   const [diary, setDiary] = useState(null);
//   useEffect(() => { getCareDiary(taskId).then(r => setDiary(r.data)); }, [taskId]);
// ============================================================

import { COLORS } from '../theme/colors';

export const MOCK_DIARY = {
  carepartner: {
    name: 'Nguyễn Thị Lan',
    role: 'CarePartner',
    avatarInitial: 'L',
    verified: true,
  },
  date: 'Thứ Tư, 24 Tháng 5, 2024',
  mood: {
    icon: 'happy',
    label: 'Vui vẻ & Hợp tác',
    note: 'Bé rất hào hứng với các bài tập vận động hôm nay.',
  },
  completion: {
    percent: 85,
    stats: [
      { value: 3, label: 'Hoạt động', color: COLORS.onSurface },
      { value: 2, label: 'Hoàn thành tốt', color: COLORS.secondary },
      { value: 1, label: 'Cần cố gắng', color: COLORS.primary },
    ],
  },
  activities: [
    {
      time: '15:30',
      title: 'Đón bé tại trường',
      desc: 'Đúng giờ, bé vui vẻ ra cổng chào.',
      status: 'done',
    },
    {
      time: '16:00',
      title: 'Bài tập Toán',
      desc: 'Hoàn thành 2 trang vở bài tập. Bé nắm chắc phép cộng có nhớ.',
      status: 'done',
    },
    {
      time: '16:45',
      title: 'Vận động ngoài trời',
      desc: 'Chơi bóng cùng các bạn trong công viên 20 phút. Bé rất hào hứng.',
      status: 'done',
    },
    {
      time: '17:15',
      title: 'Đọc sách kể chuyện',
      desc: 'Đọc truyện "Cô bé quàng khăn đỏ". Bé đặt nhiều câu hỏi hay.',
      status: 'partial',
    },
    {
      time: '17:45',
      title: 'Tắm & thay đồ',
      desc: 'Bé tự thay đồ được, chỉ cần hỗ trợ cài nút.',
      status: 'done',
    },
  ],
  note: 'Hôm nay bé ăn ngoan, ngủ đúng giờ. Bé có hỏi về bố mẹ nhưng được dỗ yên nhanh. Sáng mai nên chuẩn bị sẵn sách truyện để bé không bị buồn khi bố mẹ đi vắng.',
  attachments: [
    { id: 1, type: 'image', color: COLORS.primaryLight },
    { id: 2, type: 'image', color: COLORS.secondaryLight },
  ],
};

export default MOCK_DIARY;
