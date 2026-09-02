// ============================================================
// rewardPointsMock — dữ liệu mẫu cho RewardPointsScreen (Nhóm B)
// Backend chưa có model "Reward Points" — khi có API, thay bằng:
//   import { getRewardPoints } from '../api/rewards';
//   const [data, setData] = useState(null);
//   useEffect(() => { getRewardPoints().then(r => setData(r.data)); }, []);
// ============================================================

import { COLORS } from '../theme/colors';

export const MOCK_REWARDS = {
  currentPoints: 2450,
  nextTierPoints: 3000,
  currentTier: 'Vàng',
  nextTier: 'Bạch Kim',
};

export const MOCK_VOUCHERS = [
  {
    id: 1,
    title: 'Voucher Highlands 50K',
    expiry: '31/12/2024',
    pointsRequired: 500,
    icon: 'cafe',
    iconColor: COLORS.primary,
    iconBg: COLORS.primaryLight,
    imageColor: '#8B4513',
  },
  {
    id: 2,
    title: 'Voucher GoFood 30K',
    expiry: '15/01/2025',
    pointsRequired: 300,
    icon: 'fast-food',
    iconColor: COLORS.secondary,
    iconBg: COLORS.secondaryLight,
    imageColor: COLORS.secondaryDark,
  },
  {
    id: 3,
    title: 'Voucher Shopee 100K',
    expiry: '28/02/2025',
    pointsRequired: 1000,
    icon: 'cart',
    iconColor: COLORS.primary,
    iconBg: COLORS.primaryLight,
    imageColor: '#EE4D2D',
  },
];

export const MOCK_HISTORY = [
  { id: 1, title: 'Hoàn thành việc "Đưa đón bé"', points: +50, date: '24/05/2024', icon: 'add-circle' },
  { id: 2, title: 'Đổi voucher Highlands 50K', points: -500, date: '20/05/2024', icon: 'swap-vertical' },
  { id: 3, title: 'Đánh giá CarePartner 5 sao', points: +20, date: '18/05/2024', icon: 'add-circle' },
  { id: 4, title: 'Hoàn thành việc "Gia sư Toán"', points: +80, date: '15/05/2024', icon: 'add-circle' },
];

export default { MOCK_REWARDS, MOCK_VOUCHERS, MOCK_HISTORY };
