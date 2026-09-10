// ============================================================
// JobTypeSelectScreen — Flow 1 Step 1: chọn 1 trong ĐÚNG 3 loại việc
// Spec: flow1-step1-parent-posting.md — UI tiếng Việt toàn bộ
// Redesign theo bản thiết kế chuẩn Google Stitch (Mobile Consumer App)
// ============================================================

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';

const JOB_TYPES = [
  {
    type: 'tutoring',
    title: 'Gia sư & Kèm học',
    desc: 'Dạy kèm Toán, Văn, Anh & năng khiếu (Vẽ, Đàn, Kỹ năng sống, MC nhí)...',
    price: 'Từ 70.000đ / giờ',
    badge: '🔥 Được đặt nhiều nhất',
    badgeBg: '#FFF4ED',
    badgeText: '#C2410C',
    badgeBorder: '#FED7AA',
    accentColor: '#F26522',
    iconBg: '#FFF4ED',
    iconBorder: '#FED7AA',
    icon: 'school',
    tags: ['Sinh viên giỏi ĐH Top', 'Đã kiểm tra bằng cấp'],
    screen: 'TutoringForm',
  },
  {
    type: 'childcare',
    title: 'Trông trẻ tại nhà',
    desc: 'Cho bé ăn uống, vui chơi an toàn, rèn nếp tự lập & hướng dẫn thói quen tốt.',
    price: 'Từ 60.000đ / giờ',
    badge: '❤️ Chăm sóc tận tâm',
    badgeBg: '#ECFDF5',
    badgeText: '#047857',
    badgeBorder: '#A7F3D0',
    accentColor: '#0D9488',
    iconBg: '#ECFDF5',
    iconBorder: '#A7F3D0',
    icon: 'heart',
    tags: ['Đã xác thực CCCD gắn chip', 'Kinh nghiệm mầm non'],
    screen: 'ChildcareForm',
  },
  {
    type: 'pickup',
    title: 'Đón trẻ tan học',
    desc: 'Đón bé từ cổng trường về nhà hoặc tới lớp học thêm với lộ trình giám sát chuẩn.',
    price: 'Từ 50.000đ / chuyến',
    badge: '📍 Live GPS Tracking 24/7',
    badgeBg: '#EFF6FF',
    badgeText: '#1D4ED8',
    badgeBorder: '#BFDBFE',
    accentColor: '#2563EB',
    iconBg: '#EFF6FF',
    iconBorder: '#BFDBFE',
    icon: 'car',
    tags: ['Báo cáo check-in ảnh', 'Có bảo hiểm chuyến đi'],
    screen: 'PickupForm',
  },
];

export default function JobTypeSelectScreen() {
  const navigation = useNavigation();
  let insets = { top: 12, bottom: 24, left: 0, right: 0 };
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const safeInsets = useSafeAreaInsets();
    if (safeInsets) insets = safeInsets;
  } catch (_e) {
    // Fallback khi chạy test không bọc SafeAreaProvider
  }

  const handleHelpPress = () => {
    Alert.alert(
      'Quy trình ghép cặp Flow 1',
      'Hệ thống EduCareLink sẽ tự động đối soát lịch rảnh và định vị GPS để gợi ý tối đa 8 CarePartner uy tín nhất cho bạn chọn.\n\nSau khi bạn chọn, CarePartner sẽ có thời gian cam kết nhận ca trước khi ca làm bắt đầu.',
      [{ text: 'Đã hiểu', style: 'default' }]
    );
  };

  const handleAIPress = () => {
    try {
      navigation.navigate('Chatbot');
    } catch {
      navigation.navigate('ParentTabs', { screen: 'Chatbot' });
    }
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 10) }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Top App Bar Navigation */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.circleBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={20} color="#1E293B" />
        </TouchableOpacity>

        <View style={styles.titleWrap}>
          <Text style={styles.topBarTitle}>Đăng việc mới</Text>
          <View style={styles.topBarSubWrap}>
            <View style={styles.dotIndicator} />
            <Text style={styles.topBarSub}>EduCareLink Caregiver</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.circleBtn}
          onPress={handleHelpPress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Trợ giúp"
          activeOpacity={0.8}
        >
          <Ionicons name="help-circle-outline" size={21} color="#64748B" />
          <View style={styles.helpBadge} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}
      >
        {/* Header & Contextual Greeting */}
        <View style={styles.greetingWrap}>
          <Text style={styles.heading}>
            Hôm nay gia đình{'\n'}
            <Text style={styles.headingOrange}>cần hỗ trợ gì?</Text>
          </Text>
          <Text style={styles.subText}>
            Chọn loại dịch vụ để hệ thống tự động đề xuất CarePartner phù hợp nhất gần bạn.
          </Text>

          {/* Context Live Pill Indicator */}
          <View style={styles.contextPill}>
            <View style={styles.pulseDotOuter}>
              <View style={styles.pulseDotInner} />
            </View>
            <Text style={styles.contextPillText}>
              ⚡ 120+ CarePartner đang sẵn sàng gần bạn
            </Text>
          </View>
        </View>

        {/* AI Express Shortcut Card */}
        <TouchableOpacity
          style={styles.aiCard}
          activeOpacity={0.9}
          onPress={handleAIPress}
        >
          <View style={styles.aiLeftWrap}>
            <View style={styles.aiIconBox}>
              <Ionicons name="flash" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.aiTextWrap}>
              <View style={styles.aiBadgeRow}>
                <View style={styles.aiTag}>
                  <Text style={styles.aiTagText}>TỰ ĐỘNG AI</Text>
                </View>
                <Text style={styles.aiTitle}>Đăng việc siêu tốc trong 5s</Text>
              </View>
              <Text style={styles.aiDesc} numberOfLines={2}>
                Chỉ cần gõ hoặc nói tự nhiên, AI tự động chọn đối tác & gợi ý mức phí.
              </Text>
            </View>
          </View>

          <View style={styles.aiActionBtn}>
            <Text style={styles.aiActionText}>Thử ngay</Text>
            <Ionicons name="chevron-forward" size={13} color="#F26522" />
          </View>
        </TouchableOpacity>

        {/* 3 Core Service Selection Cards */}
        <View style={styles.servicesSection}>
          {JOB_TYPES.map((item) => (
            <TouchableOpacity
              key={item.type}
              style={styles.card}
              activeOpacity={0.88}
              onPress={() => navigation.navigate(item.screen)}
            >
              {/* Left Decorative Accent Strip */}
              <View style={[styles.accentStrip, { backgroundColor: item.accentColor }]} />

              <View style={styles.cardInner}>
                {/* Top Badge & Price */}
                <View style={styles.cardTopRow}>
                  <View style={[styles.badgePill, { backgroundColor: item.badgeBg, borderColor: item.badgeBorder }]}>
                    <Text style={[styles.badgePillText, { color: item.badgeText }]}>{item.badge}</Text>
                  </View>
                  <View style={[styles.pricePill, { backgroundColor: item.badgeBg, borderColor: item.badgeBorder }]}>
                    <Text style={[styles.pricePillText, { color: item.badgeText }]}>{item.price}</Text>
                  </View>
                </View>

                {/* Main Body: Icon + Details */}
                <View style={styles.cardMainRow}>
                  <View style={[styles.iconBox, { backgroundColor: item.iconBg, borderColor: item.iconBorder }]}>
                    <Ionicons name={item.icon} size={26} color={item.accentColor} />
                  </View>

                  <View style={styles.textWrap}>
                    <View style={styles.cardTitleRow}>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                    </View>
                    <Text style={styles.cardDesc} numberOfLines={2}>{item.desc}</Text>

                    {/* Tags */}
                    <View style={styles.tagsRow}>
                      {item.tags.map((tag, idx) => (
                        <View key={idx} style={styles.tagPill}>
                          <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                          <Text style={styles.tagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Trust & Safety Assurance Strip */}
        <View style={styles.trustSection}>
          <View style={styles.trustHeader}>
            <View style={styles.trustHeaderDot} />
            <Text style={styles.trustHeaderTitle}>CAM KẾT BẢO VỆ 3 LỚP EDUCARE</Text>
          </View>

          <View style={styles.trustItem}>
            <View style={[styles.trustIconWrap, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="shield-checkmark" size={14} color="#10B981" />
            </View>
            <Text style={styles.trustText}>
              <Text style={styles.trustBold}>100% Hồ sơ</Text> đối soát CCCD gắn chip & thẻ Sinh viên
            </Text>
          </View>

          <View style={styles.trustItem}>
            <View style={[styles.trustIconWrap, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="card" size={14} color="#2563EB" />
            </View>
            <Text style={styles.trustText}>
              <Text style={styles.trustBold}>Ký quỹ MoMo/VietQR:</Text> Chỉ thanh toán khi phụ huynh hài lòng
            </Text>
          </View>

          <View style={styles.trustItem}>
            <View style={[styles.trustIconWrap, { backgroundColor: '#FFF4ED' }]}>
              <Ionicons name="navigate-circle" size={15} color="#F26522" />
            </View>
            <Text style={styles.trustText}>
              <Text style={styles.trustBold}>An tâm di chuyển:</Text> Giám sát thời gian thực & nút SOS hỗ trợ
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  helpBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#F26522',
  },
  titleWrap: {
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  topBarSubWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  dotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F26522',
  },
  topBarSub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  greetingWrap: {
    marginBottom: 16,
  },
  heading: {
    fontSize: 23,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  headingOrange: {
    color: '#F26522',
  },
  subText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 6,
    lineHeight: 19,
  },
  contextPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 10,
    gap: 6,
  },
  pulseDotOuter: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseDotInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  contextPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  aiCard: {
    backgroundColor: '#F26522',
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4,
  },
  aiLeftWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  aiIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTextWrap: {
    flex: 1,
  },
  aiBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  aiTagText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  aiTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  aiDesc: {
    color: '#FFEDD5',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  aiActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 2,
    marginLeft: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  aiActionText: {
    color: '#F26522',
    fontSize: 11,
    fontWeight: '800',
  },
  servicesSection: {
    gap: 12,
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  accentStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  cardInner: {
    padding: 14,
    paddingLeft: 16,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  pricePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  pricePillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  cardMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
    lineHeight: 17,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 10,
    gap: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  trustSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 9,
  },
  trustHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  trustHeaderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  trustHeaderTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trustIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustText: {
    fontSize: 11,
    color: '#475569',
    flex: 1,
    lineHeight: 16,
  },
  trustBold: {
    fontWeight: '700',
    color: '#0F172A',
  },
});

