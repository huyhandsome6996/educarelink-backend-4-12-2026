// WorkerFeedScreen.js — Trang chủ CarePartner (Flow ghép cặp AI mới)
// CHỈ hiển thị đơn mà Phụ huynh đã CHỌN carepartner này (awaiting_commitment).
// Không có ứng tuyển tự do. Bấm vào đơn → xem chi tiết → Xác nhận hoặc Huỷ.

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
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

const formatSlot = (slot) => {
  if (!slot) return '';
  return `${slot.date} · ${(slot.time_from || '').slice(0, 5)} – ${(slot.time_to || '').slice(0, 5)}`;
};

export default function WorkerFeedScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const bounceAnim = useRef(new Animated.Value(0)).current;
  const bounceRef = useRef(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      // Chỉ lấy đơn trạng thái "awaiting_commitment" — phụ huynh vừa chọn mình
      const { data } = await getBookings({ role: 'carepartner', status: 'awaiting_commitment' });
      setBookings(data.results ?? data ?? []);
    } catch {
      setError('Không tải được đơn. Kéo xuống để thử lại.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Bounce animation khi danh sách rỗng
  useEffect(() => {
    if (!loading && bookings.length === 0) {
      bounceRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(bounceAnim, { toValue: -8, duration: 600, useNativeDriver: true }),
          Animated.timing(bounceAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      );
      bounceRef.current.start();
      return () => { bounceRef.current?.stop(); };
    }
  }, [loading, bookings.length, bounceAnim]);

  const displayName = user?.first_name || user?.username || 'Bạn';

  const renderItem = ({ item }) => {
    const price = item.total_value_vnd ?? item.job_price ?? 0;
    const title = item.job_title || 'Công việc được giao';
    const parentName = item.parent_name || 'Phụ huynh';
    const address = item.job_address || '';
    const slot = item.first_slot;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => navigation.navigate('BookingDetail', { bookingId: item.id })}
      >
        {/* Badge + giá */}
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Ionicons name="time-outline" size={12} color={COLORS.primary} />
            <Text style={styles.badgeText}>Chờ xác nhận của bạn</Text>
          </View>
          <Text style={styles.cardPrice}>{Number(price).toLocaleString('vi-VN')}đ</Text>
        </View>

        {/* Tiêu đề */}
        <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>

        {/* Meta */}
        <View style={styles.metaBox}>
          {slot ? (
            <View style={styles.metaRow}>
              <View style={styles.metaIcon}>
                <Ionicons name="calendar-outline" size={13} color={COLORS.primary} />
              </View>
              <Text style={styles.metaText}>{formatSlot(slot)}</Text>
            </View>
          ) : null}
          {address ? (
            <View style={styles.metaRow}>
              <View style={styles.metaIcon}>
                <Ionicons name="location-outline" size={13} color={COLORS.primary} />
              </View>
              <Text style={styles.metaText} numberOfLines={1}>{address}</Text>
            </View>
          ) : null}
        </View>

        {/* Footer */}
        <View style={styles.cardFooter}>
          <View style={styles.parentRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{parentName[0]?.toUpperCase() || 'P'}</Text>
            </View>
            <Text style={styles.parentName}>{parentName} đã chọn bạn</Text>
          </View>
          <View style={styles.arrowCircle}>
            <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.deco1} />
        <View style={styles.deco2} />
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greet}>CarePartner</Text>
            <Text style={styles.headerName}>Chào, {displayName}!</Text>
          </View>
          <NotificationBell />
        </View>
        <Text style={styles.headerSub}>
          Phụ huynh đã chọn bạn — hãy xem chi tiết và quyết định nhận hay huỷ.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : error ? (
        <View style={styles.errorBox}>
          <Ionicons name="cloud-offline-outline" size={44} color="#d1d5db" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={COLORS.primary}
            />
          }
          ListHeaderComponent={
            bookings.length > 0 ? (
              <Text style={styles.sectionHeader}>
                {bookings.length} đơn chờ xác nhận
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Animated.View style={[styles.emptyCircle, { transform: [{ translateY: bounceAnim }] }]}>
                <Ionicons name="briefcase-outline" size={36} color={COLORS.primary} />
              </Animated.View>
              <Text style={styles.emptyTitle}>Chưa có công việc nào</Text>
              <Text style={styles.emptyText}>
                Khi phụ huynh chọn bạn từ danh sách AI gợi ý, đơn sẽ hiển thị tại đây để bạn xác nhận.
              </Text>
              <TouchableOpacity
                style={styles.goJobsBtn}
                onPress={() => navigation.navigate('MyBookings')}
                activeOpacity={0.85}
              >
                <Ionicons name="list-outline" size={16} color="#fff" />
                <Text style={styles.goJobsBtnText}>Xem toàn bộ đơn của tôi</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  // Header
  header: {
    backgroundColor: COLORS.primary,
    paddingBottom: 20, paddingHorizontal: 20,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
    overflow: 'hidden', position: 'relative',
  },
  deco1: {
    position: 'absolute', top: -30, right: -20,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  deco2: {
    position: 'absolute', bottom: -15, left: -25,
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  greet: { color: 'rgba(255,255,255,0.7)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  headerName: { color: '#fff', fontSize: 22, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, lineHeight: 18 },
  // List
  list: { padding: SIZES.md, paddingBottom: 40 },
  sectionHeader: {
    fontSize: 12, fontWeight: '700', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
  },
  // Card
  card: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    padding: 16, marginBottom: 12,
    ...SHADOWS.cardHover,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary,
  },
  badgeRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primaryLight, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  badgeText: { color: COLORS.primary, fontSize: 11, fontWeight: '700' },
  cardPrice: { color: COLORS.primary, fontSize: 16, fontWeight: '900' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 10 },
  metaBox: { gap: 6, marginBottom: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaIcon: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.surfaceAlt, justifyContent: 'center', alignItems: 'center',
  },
  metaText: { fontSize: 13, color: COLORS.textSecondary, flex: 1 },
  // Footer card
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  parentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: COLORS.primarySoft, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: COLORS.primary, fontSize: 14, fontWeight: '800' },
  parentName: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  arrowCircle: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center',
  },
  // Empty
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30, gap: 12 },
  emptyCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.small,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
  emptyText: { fontSize: 13.5, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
  goJobsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd,
    paddingHorizontal: 20, paddingVertical: 12, marginTop: 8,
    ...SHADOWS.small,
  },
  goJobsBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  // Error
  errorBox: { alignItems: 'center', paddingTop: 80, gap: 12, paddingHorizontal: 30 },
  errorText: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },
  retryBtn: {
    backgroundColor: COLORS.primary, borderRadius: 20,
    paddingHorizontal: 24, paddingVertical: 10,
  },
  retryText: { color: '#fff', fontWeight: '700' },
});