// ============================================================
// showComingSoon — helper chuẩn hoá thông báo "Tính năng đang
// được phát triển" cho toàn bộ app.
//
// QA-FIX-UI: dùng cho các nút/hành động chưa có backend/logic
// thật trong đợt redesign UI. Tránh mỗi nơi viết Alert.alert
// một kiểu khác nhau.
//
// Cách dùng:
//   import { showComingSoon } from '../utils/comingSoon';
//   <TouchableOpacity onPress={() => showComingSoon('Đổi điểm thưởng')}>
//     ...
//   </TouchableOpacity>
//
// Hoặc không truyền tên tính năng:
//   onPress={() => showComingSoon()}
// ============================================================

import { Alert } from 'react-native';

export function showComingSoon(featureName) {
  Alert.alert(
    'Thông báo',
    featureName
      ? `Tính năng "${featureName}" đang được phát triển. Vui lòng quay lại sau!`
      : 'Tính năng đang được phát triển. Vui lòng quay lại sau!',
    [{ text: 'Đã hiểu', style: 'default' }]
  );
}

export default showComingSoon;
