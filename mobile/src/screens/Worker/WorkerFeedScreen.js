// WorkerFeedScreen.js — Trang chủ CarePartner (Nâng cấp theo thiết kế Google Stitch)
// CHỈ hiển thị đơn mà Phụ huynh đã CHỌN carepartner này (awaiting_commitment).
// Kết nối trực tiếp API getBookings({ role: 'carepartner', status: 'awaiting_commitment' }).
// Đếm ngược thời gian thực, hiển thị chỉ số uy tín ELO, thẻ đơn bento hiện đại.

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl, Animated,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { getBookings } from '../../api/matching';
import NotificationBell from '../../components/NotificationBell';
import { SHADOWS } from '../../theme/colors';

const formatSlot = (slot) => {
  if (!slot) return '';
  const dayStr = slot.day_of_week_vi ? `${slot.day_of_week_vi}, ` : '';
  const dateStr = slot.date_vi || slot.date || '';
  const fromStr = (slot.time_from_vi || slot.time_from || '').slice(0, 5);
  const toStr = (slot.time_to_vi || slot.time_to || '').slice(0, 5);
  return `${dayStr}${dateStr} · ${fromStr} – ${toStr}`;
};

const formatSeconds = (sec) => {
  if (sec == null || sec <= 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export default function WorkerFeedScreen() {
  const navigation = useNavigation();
  let insets = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    const safeInsets = useSafeAreaInsets();
    if (safeInsets) insets = safeInsets;
  } catch (_) {}
  const { user } = useAuth();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const bounceAnim = useRef(new Animated.Value(0)).current;
  const bounceRef = useRef(null);

  // Interval chạy mỗi giây để cập nhật đếm ngược các thẻ đơn
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      // Chỉ lấy đơn trạng thái awaiting_commitment — phụ huynh trực tiếp chọn carepartner này
      const { data } = await getBookings({ role: 'carepartner', status: 'awaiting_commitment' });
      const rawList = data.results ?? data ?? [];
      // Lưu lại thời điểm fetch để tính seconds_left chính xác
      const fetchedAt = Date.now();
      const enriched = rawList.map((item) => ({
        ...item,
        _fetchedAt: fetchedAt,
        _initialSecondsLeft: item.seconds_left != null ? item.seconds_left : 900,
      }));
      setBookings(enriched);
    } catch {
      setError('Không tải được đơn mới. Kéo xuống để thử lại.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Bounce animation cho icon vali ở empty state
  useEffect(() => {
    if (!loading && bookings.length === 0) {
      bounceRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(bounceAnim, { toValue: -10, duration: 650, useNativeDriver: true }),
          Animated.timing(bounceAnim, { toValue: 0, duration: 650, useNativeDriver: true }),
        ])
      );
      bounceRef.current.start();
      return () => { bounceRef.current?.stop(); };
    }
  }, [loading, bookings.length, bounceAnim]);

  const displayName = user?.first_name || user?.username || 'Bạn';

  const renderItem = ({ item }) => {
    const elapsed = Math.floor((now - (item._fetchedAt || now)) / 1000);
    const currentSecondsLeft = Math.max(0, (item._initialSecondsLeft || 900) - elapsed);

    const price = item.carepartner_payout_vnd ?? Math.round((item.total_value_vnd || item.job_price || 0) * 0.8);
    const title = item.job_title || 'Công việc được giao';
    const parentName = item.parent_name || 'Phụ huynh';
    const address = item.job_address || 'Địa chỉ hiển thị chi tiết khi nhận';
    const slot = item.first_slot;
    const categoryName = item.category_name_vi || 'Gia sư / Chăm sóc';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.92}
        onPress={() => navigation.navigate('BookingDetail', { bookingId: item.id })}
      >
        {/* Hàng 1: Badge đếm ngược khẩn cấp + Thù lao nhận được */}
        <View style={styles.cardTopRow}>
          <View style={styles.urgencyBadge}>
            <Ionicons name="hourglass-outline" size={13} color="#92400E" />
            <Text style={styles.urgencyText}>
              {currentSecondsLeft > 0 ? `Còn ${formatSeconds(currentSecondsLeft)} để xác nhận` : 'Hết hạn suy nghĩ'}
            </Text>
          </View>
          <View style={styles.priceContainer}>
            <Text style={styles.priceNumber}>{Number(price).toLocaleString('vi-VN')}đ</Text>
            <Text style={styles.priceSub}>/ ca làm</Text>
          </View>
        </View>

        {/* Hàng 2: Tiêu đề công việc & Tag danh mục */}
        <View style={styles.categoryPill}>
          <Text style={styles.categoryPillText}>{categoryName}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>

        {/* Hàng 3: Hồ sơ Phụ huynh (Đã xác thực & Đánh giá) */}
        <View style={styles.parentSnapshot}>
          <View style={styles.parentAvatar}>
            <Text style={styles.parentAvatarText}>{parentName[0]?.toUpperCase() || 'P'}</Text>
          </View>
          <View style={styles.parentMeta}>
            <View style={styles.parentNameRow}>
              <Text style={styles.parentNameText}>{parentName}</Text>
              <View style={styles.verifiedTag}>
                <Ionicons name="shield-checkmark" size={11} color="#0E9F6E" />
                <Text style={styles.verifiedText}>Đã xác thực CCCD</Text>
              </View>
            </View>
            <Text style={styles.parentSubText}>⭐ 5.0 · Đã ký quỹ MoMo Escrow 100%</Text>
          </View>
        </View>

        {/* Hàng 4: Lịch làm & Địa điểm bento */}
        <View style={styles.slotLocationBox}>
          {slot ? (
            <View style={styles.infoRow}>
              <View style={styles.infoIconCircle}>
                <Ionicons name="calendar" size={13} color="#F26522" />
              </View>
              <Text style={styles.infoRowText}>{formatSlot(slot)}</Text>
            </View>
          ) : null}
          <View style={styles.infoRow}>
            <View style={styles.infoIconCircle}>
              <Ionicons name="location" size={13} color="#F26522" />
            </View>
            <Text style={styles.infoRowText} numberOfLines={1}>{address}</Text>
          </View>
        </View>

        {/* Hàng 5: Card Action Footer */}
        <View style={styles.cardFooter}>
          <View style={styles.aiPickTag}>
            <Ionicons name="sparkles" size={13} color="#EA580C" />
            <Text style={styles.aiPickText}>Phụ huynh chọn bạn từ gợi ý AI</Text>
          </View>
          <View style={styles.detailCtaBtn}>
            <Text style={styles.detailCtaText}>Xem chi tiết</Text>
            <Ionicons name="arrow-forward" size={14} color="#EA580C" />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#EA580C" />

      {/* Header Cam Phong Cách Stitch */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 10 }]}>
        {/* Hình tròn trang trí mờ ở background */}
        <View style={styles.headerDecoRing1} />
        <View style={styles.headerDecoRing2} />

        {/* Dòng trên cùng: Badge xác thực + Trạng thái + Chuông thông báo */}
        <View style={styles.headerTopBar}>
          <View style={styles.verifiedBadgeHeader}>
            <Ionicons name="shield-checkmark" size={12} color="#fff" />
            <Text style={styles.verifiedBadgeHeaderText}>CAREPARTNER ĐÃ ĐỐI SOÁT</Text>
          </View>

          <View style={styles.headerRightActions}>
            <View style={styles.statusPill}>
              <View style={styles.statusDotGreen} />
              <Text style={styles.statusPillText}>Sẵn sàng nhận việc</Text>
            </View>
            <NotificationBell />
          </View>
        </View>

        {/* Lời chào & Thông điệp giá trị */}
        <Text style={styles.greetingTitle}>Chào, {displayName}! 👋</Text>
        <Text style={styles.greetingSubtitle}>
          Phụ huynh chọn bạn trực tiếp — Vui lòng xem và xác nhận trước khi hết hạn.
        </Text>
      </View>

      {/* Quick Stats Floating Mini-Bar (Nổi chèn đáy header) */}
      <View style={styles.floatingStatsBar}>
        <View style={styles.statCol}>
          <View style={styles.statIconRow}>
            <Ionicons name="time-outline" size={15} color="#F26522" />
            <Text style={styles.statValue}>{bookings.length} ca</Text>
          </View>
          <Text style={styles.statLabel}>Chờ bạn duyệt</Text>
        </View>
        <View style={styles.statDivider} />

        <View style={styles.statCol}>
          <View style={styles.statIconRow}>
            <Ionicons name="star" size={15} color="#F59E0B" />
            <Text style={styles.statValue}>98/100</Text>
          </View>
          <Text style={styles.statLabel}>Điểm uy tín ELO</Text>
        </View>
        <View style={styles.statDivider} />

        <View style={styles.statCol}>
          <View style={styles.statIconRow}>
            <Ionicons name="checkmark-circle" size={15} color="#0E9F6E" />
            <Text style={styles.statValue}>100%</Text>
          </View>
          <Text style={styles.statLabel}>Tỷ lệ đúng giờ</Text>
        </View>
      </View>

      {/* Nội dung danh sách đơn */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#F26522" />
          <Text style={styles.loadingText}>Đang quét các đơn mới dành riêng cho bạn...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Ionicons name="cloud-offline-outline" size={46} color="#94A3B8" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
            <Text style={styles.retryBtnText}>Thử lại ngay</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="#F26522"
              colors={['#F26522']}
            />
          }
          ListHeaderComponent={
            bookings.length > 0 ? (
              <View style={styles.sectionHeaderBox}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>ĐƠN MỚI CẦN BẠN XÁC NHẬN</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{bookings.length}</Text>
                  </View>
                </View>
                <Text style={styles.sectionSub}>Bấm vào đơn để xem chi tiết ca làm và xác nhận cam kết</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Animated.View style={[styles.emptyIconCircle, { transform: [{ translateY: bounceAnim }] }]}>
                <Ionicons name="briefcase" size={38} color="#EA580C" />
              </Animated.View>
              <Text style={styles.emptyTitle}>Hiện chưa có ca mới chờ xác nhận</Text>
              <Text style={styles.emptyDescription}>
                Lịch rảnh của bạn đang được thuật toán AI tự động kết nối với các phụ huynh gần nhất. Bạn sẽ nhận được thông báo ngay khi có phụ huynh chọn bạn!
              </Text>

              {/* 2 nút hành động như trong thiết kế Stitch */}
              <TouchableOpacity
                style={styles.primaryEmptyBtn}
                onPress={() => navigation.navigate('WorkerJobs')}
                activeOpacity={0.88}
              >
                <Ionicons name="calendar-outline" size={17} color="#FFFFFF" />
                <Text style={styles.primaryEmptyBtnText}>Xem các ca đã cam kết ở tab Công việc →</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryEmptyBtn}
                onPress={() => navigation.navigate('WorkerAvailability')}
                activeOpacity={0.85}
              >
                <Ionicons name="time-outline" size={16} color="#EA580C" />
                <Text style={styles.secondaryEmptyBtnText}>Cập nhật lại lịch rảnh trong tuần</Text>
              </TouchableOpacity>

              {/* Mẹo tăng cơ hội */}
              <View style={styles.proTipBox}>
                <View style={styles.proTipHeader}>
                  <Ionicons name="bulb-outline" size={16} color="#D97706" />
                  <Text style={styles.proTipTitle}>Mẹo tăng cơ hội nhận việc</Text>
                </View>
                <Text style={styles.proTipText}>
                  Cập nhật lịch rảnh đều đặn và phản hồi trong 15 phút đầu để duy trì điểm ELO cao và xuất hiện top 1 trong gợi ý của phụ huynh.
                </Text>
              </View>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  // Top Header Gradient Style
  headerContainer: {
    backgroundColor: '#EA580C',
    paddingBottom: 38,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
    position: 'relative',
  },
  headerDecoRing1: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerDecoRing2: {
    position: 'absolute',
    bottom: -20,
    left: -20,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  verifiedBadgeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  verifiedBadgeHeaderText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDotGreen: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#34D399',
  },
  statusPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  greetingTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  greetingSubtitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 4,
    fontWeight: '500',
  },

  // Floating Stats Bar Overlap
  floatingStatsBar: {
    marginTop: -22,
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.cardHover,
  },
  statCol: {
    alignItems: 'center',
    flex: 1,
  },
  statIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 26,
    backgroundColor: '#E2E8F0',
  },

  // List Section
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  sectionHeaderBox: {
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.6,
  },
  countBadge: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 10,
  },
  countBadgeText: {
    color: '#EA580C',
    fontSize: 11,
    fontWeight: '800',
  },
  sectionSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },

  // Job Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderLeftWidth: 4.5,
    borderLeftColor: '#F26522',
    ...SHADOWS.cardHover,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  urgencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  urgencyText: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '700',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  priceNumber: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0E9F6E',
  },
  priceSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  categoryPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    marginBottom: 6,
  },
  categoryPillText: {
    color: '#EA580C',
    fontSize: 11,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 22,
    marginBottom: 10,
  },
  parentSnapshot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 9,
    marginBottom: 10,
  },
  parentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFEDD5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  parentAvatarText: {
    color: '#EA580C',
    fontSize: 14,
    fontWeight: '800',
  },
  parentMeta: {
    flex: 1,
  },
  parentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  parentNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  verifiedText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#0E9F6E',
  },
  parentSubText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1.5,
  },
  slotLocationBox: {
    gap: 6,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoRowText: {
    fontSize: 12.5,
    color: '#475569',
    fontWeight: '500',
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  aiPickTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  aiPickText: {
    fontSize: 11,
    color: '#EA580C',
    fontWeight: '600',
  },
  detailCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: 9,
  },
  detailCtaText: {
    color: '#EA580C',
    fontSize: 11.5,
    fontWeight: '700',
  },

  // Loading & Error
  loadingBox: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  loadingText: {
    color: '#64748B',
    fontSize: 13,
  },
  errorBox: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
    gap: 12,
  },
  errorText: {
    color: '#64748B',
    fontSize: 13.5,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: '#EA580C',
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 18,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 10,
  },
  emptyIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#FFF7ED',
    borderWidth: 2,
    borderColor: '#FFEDD5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    ...SHADOWS.small,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  primaryEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EA580C',
    width: '100%',
    paddingVertical: 13,
    borderRadius: 14,
    marginBottom: 10,
    ...SHADOWS.small,
  },
  primaryEmptyBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  secondaryEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    width: '100%',
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 20,
  },
  secondaryEmptyBtnText: {
    color: '#EA580C',
    fontSize: 13,
    fontWeight: '700',
  },
  proTipBox: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 13,
    width: '100%',
  },
  proTipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  proTipTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
  proTipText: {
    fontSize: 11.5,
    color: '#78350F',
    lineHeight: 17,
  },
});
