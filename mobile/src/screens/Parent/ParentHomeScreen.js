import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated,
  StatusBar, Alert, ActivityIndicator, RefreshControl, Platform, Dimensions
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getMyTasksAsParent } from '../../api/tasks';
import NotificationBell from '../../components/NotificationBell';
import { COLORS, SHADOWS, SIZES, TYPO, ANIM } from '../../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// === Warm Professionalism: status → color mapping (sync my_tasks design) ===
const STATUS_MAPPING = {
  open:         { label: 'Đang chờ',     color: COLORS.warning,     bg: COLORS.warningBg,    icon: 'time-outline'        },
  in_progress:  { label: 'Đang diễn ra',  color: COLORS.info,        bg: COLORS.infoBg,       icon: 'sync-outline'        },
  completed:    { label: 'Hoàn tất',      color: COLORS.successDeep, bg: COLORS.successBgDeep,icon: 'checkmark-circle'    },
  cancelled:    { label: 'Đã huỷ',        color: COLORS.textMuted,   bg: '#F3F4F6',           icon: 'close-circle'        },
};

// === Bento grid: 3 service tiles — wide Gia sư tile spans 2 cols ===
const SERVICE_TILES = [
  { id: 'pickup',    iconName: 'car-outline',       label: 'Đưa đón',   tintBg: '#CAE6FF', tintFg: COLORS.tertiary },
  { id: 'companion', iconName: 'people-outline',    label: 'Đồng hành', tintBg: '#76FA84', tintFg: COLORS.secondaryDeep },
  { id: 'tutor',     iconName: 'school-outline',    label: 'Gia sư',    tintBg: COLORS.primaryLight, tintFg: COLORS.primary, wide: true,
    subtitle: 'Hỗ trợ bài tập về nhà & ôn tập' },
];

// === Mock suggested CarePartners (design pattern — backend có thể bổ sung API sau) ===
const SUGGESTED_PARTNERS = [
  { id: 1, name: 'Nguyễn Mai',  rating: 4.9, reviews: '120 chuyến', tags: ['Đưa đón', 'Gia sư'], price: '60k', verified: true },
  { id: 2, name: 'Cô Lan',      rating: 5.0, reviews: '85 giờ',    tags: ['Đồng hành'],         price: '80k', verified: true },
];

export default function ParentHomeScreen() {
  const navigation = useNavigation();
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Pulse animation for empty state icon
  const pulseAnimRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isLoading && tasks.length === 0) {
      pulseAnimRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: ANIM.timingSlow, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: ANIM.timingSlow, useNativeDriver: true }),
        ])
      );
      pulseAnimRef.current.start();
      return () => {
        if (pulseAnimRef.current) {
          pulseAnimRef.current.stop();
          pulseAnimRef.current = null;
        }
      };
    }
  }, [isLoading, tasks.length, pulseAnim]);

  const fetchTasks = async () => {
    try {
      const res = await getMyTasksAsParent();
      setTasks(res.data.slice(0, 3));
    } catch (e) {
      console.error('Lỗi tải danh sách việc:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchTasks(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchTasks(); };

  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : user?.username || 'Phụ huynh';

  // Greeting based on hour of day (design shows "Chào buổi sáng")
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      {/* === Top App Bar — Warm Professionalism (flat cream, no gradient) === */}
      <View style={styles.topBar}>
        <View style={styles.avatarWrap}>
          <Ionicons name="person" size={20} color={COLORS.primaryText} />
        </View>
        <Text style={styles.brandTitle}>EduCareLink</Text>
        <View style={styles.topBarRight}>
          <NotificationBell color={COLORS.primaryText} style={styles.topBarBell} />
        </View>
      </View>

      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
      >
        {/* === Greeting === */}
        <View style={styles.greetingWrap}>
          <Text style={styles.greetingTitle}>{greeting}, {displayName}!</Text>
          <Text style={styles.greetingSubtitle}>Sẵn sàng cho một ngày tuyệt vời?</Text>
        </View>

        {/* === Promo Banner — orange #F26522 with discount + bus icon === */}
        <View style={styles.promoBanner}>
          <View style={styles.promoContent}>
            <Text style={styles.promoTitle}>Giảm 20% tháng này!</Text>
            <Text style={styles.promoSubtitle}>Cho dịch vụ Đưa đón học sinh định kỳ.</Text>
          </View>
          <View style={styles.promoIconWrap}>
            <Ionicons name="bus" size={28} color="#FFFFFF" />
          </View>
          {/* Decorative blur circle */}
          <View style={styles.promoBlurCircle} />
        </View>

        {/* === Service Categories — Bento Grid === */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dịch vụ</Text>
          <View style={styles.bentoGrid}>
            {SERVICE_TILES.map((tile) => (
              <TouchableOpacity
                key={tile.id}
                style={[styles.bentoTile, tile.wide && styles.bentoTileWide]}
                onPress={() => navigation.navigate('CreateTask')}
                activeOpacity={0.7}
              >
                <View style={[styles.bentoIconCircle, { backgroundColor: tile.tintBg }]}>
                  <Ionicons name={tile.iconName} size={24} color={tile.tintFg} />
                </View>
                {tile.wide ? (
                  <View style={styles.bentoTileWideContent}>
                    <Text style={styles.bentoTileLabel}>{tile.label}</Text>
                    {tile.subtitle ? <Text style={styles.bentoTileSubtitle}>{tile.subtitle}</Text> : null}
                  </View>
                ) : (
                  <Text style={styles.bentoTileLabel}>{tile.label}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* === Suggested CarePartners — horizontal scrolling cards === */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>CarePartner Gợi ý</Text>
            <TouchableOpacity onPress={() => navigation.navigate('CreateTask')}>
              <Text style={styles.seeAllLink}>Xem tất cả</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: SIZES.md, paddingRight: SIZES.marginMobile }}
            style={{ marginHorizontal: -SIZES.marginMobile, paddingHorizontal: SIZES.marginMobile }}
          >
            {SUGGESTED_PARTNERS.map((partner) => (
              <View key={partner.id} style={styles.partnerCard}>
                <View style={styles.partnerCardTop}>
                  <View style={styles.partnerAvatarWrap}>
                    <Ionicons name="person" size={22} color={COLORS.primaryText} />
                  </View>
                  <View style={styles.partnerInfo}>
                    <Text style={styles.partnerName}>{partner.name}</Text>
                    <View style={styles.partnerRatingRow}>
                      <Ionicons name="star" size={12} color="#F59E0B" />
                      <Text style={styles.partnerRating}>{partner.rating}</Text>
                      <Text style={styles.partnerReviews}> ({partner.reviews})</Text>
                    </View>
                  </View>
                  {partner.verified && (
                    <View style={styles.partnerVerifiedBadge}>
                      <Ionicons name="checkmark-circle" size={18} color={COLORS.secondaryDeep} />
                    </View>
                  )}
                </View>
                <View style={styles.partnerTagsRow}>
                  {partner.tags.map((tag) => (
                    <View key={tag} style={styles.partnerTag}>
                      <Text style={styles.partnerTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.partnerCardFooter}>
                  <View>
                    <Text style={styles.partnerPriceLabel}>Từ</Text>
                    <Text style={styles.partnerPriceValue}>
                      {partner.price}<Text style={styles.partnerPriceUnit}>/giờ</Text>
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.partnerBookBtn}
                    onPress={() => navigation.navigate('CreateTask')}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.partnerBookBtnText}>Đặt lịch</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* === Recent Activity === */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hoạt động gần đây</Text>

          {/* === Upgrade to Carepartner banner (only if user is parent + not yet a carepartner) === */}
          {user?.role === 'parent' && !user?.is_staff && (
            <TouchableOpacity
              style={styles.upgradeBanner}
              onPress={() => navigation.navigate('UpgradeToCarepartner')}
              activeOpacity={0.9}
            >
              <View style={styles.upgradeBannerIconCircle}>
                <Ionicons name="school" size={22} color={COLORS.primary} />
              </View>
              <View style={styles.upgradeBannerInfo}>
                <Text style={styles.upgradeBannerTitle}>Trở thành Carepartner</Text>
                <Text style={styles.upgradeBannerDesc}>
                  Kiếm thêm thu nhập linh hoạt bằng việc làm sinh viên
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={COLORS.primary} />
            </TouchableOpacity>
          )}

          {isLoading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 32 }} />
          ) : tasks.length === 0 ? (
            <View style={styles.emptyBox}>
              <Animated.View style={[styles.emptyIconCircle, { transform: [{ scale: pulseAnim }] }]}>
                <Ionicons name="document-text-outline" size={36} color={COLORS.primary} />
              </Animated.View>
              <Text style={styles.emptyTitle}>Chưa có hoạt động nào</Text>
              <Text style={styles.emptyText}>Hãy đăng việc đầu tiên để tìm Carepartner phù hợp!</Text>
              <TouchableOpacity onPress={() => navigation.navigate('CreateTask')} style={styles.emptyBtn} activeOpacity={0.85}>
                <Ionicons name="add-circle" size={20} color="#fff" />
                <Text style={styles.emptyBtnText}>Đăng việc ngay</Text>
              </TouchableOpacity>
            </View>
          ) : (
            tasks.map((task) => {
              const st = STATUS_MAPPING[task.status] || STATUS_MAPPING.open;
              return (
                <TouchableOpacity
                  key={task.id}
                  style={[styles.activityCard, { borderLeftColor: st.color }]}
                  onPress={() => navigation.navigate('MyTasks')}
                  activeOpacity={0.9}
                >
                  <View style={styles.activityCardRow}>
                    <View style={[styles.activityIconCircle, { backgroundColor: st.bg }]}>
                      <Ionicons name={st.icon} size={20} color={st.color} />
                    </View>
                    <View style={styles.activityCardContent}>
                      <Text style={styles.activityTitle} numberOfLines={1}>{task.title}</Text>
                      <Text style={styles.activityMeta} numberOfLines={1}>
                        CarePartner: {task.carepartner_name || 'Đang tìm...'}
                      </Text>
                    </View>
                    <View style={[styles.activityStatusChip, { backgroundColor: st.bg }]}>
                      <Text style={[styles.activityStatusText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* === FAB — Floating Action Button (orange glow) === */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateTask')}
        activeOpacity={0.9}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  // === TOP APP BAR (flat, warm cream) ===
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.marginMobile,
    paddingVertical: SIZES.sm,
    backgroundColor: COLORS.surface,
    paddingTop: Platform.OS === 'ios' ? 50 : 38,
  },
  avatarWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.outlineVariant,
  },
  brandTitle: {
    ...TYPO.h2, color: COLORS.primaryText, fontSize: 22,
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm },
  topBarBell: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center', alignItems: 'center',
  },
  // === BODY ===
  body: { flex: 1 },
  // === GREETING ===
  greetingWrap: {
    paddingHorizontal: SIZES.marginMobile,
    marginTop: SIZES.md, marginBottom: SIZES.lg,
  },
  greetingTitle: { ...TYPO.h2, color: COLORS.textPrimary, marginBottom: 4 },
  greetingSubtitle: { ...TYPO.body, color: COLORS.textSecondary },
  // === PROMO BANNER (orange #F26522) ===
  promoBanner: {
    marginHorizontal: SIZES.marginMobile,
    marginBottom: SIZES.lg,
    backgroundColor: COLORS.primary,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    overflow: 'hidden',
    ...SHADOWS.medium,
  },
  promoContent: { flex: 1, marginRight: SIZES.md },
  promoTitle: { ...TYPO.h3, color: '#FFFFFF', marginBottom: 4 },
  promoSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 18 },
  promoIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  promoBlurCircle: {
    position: 'absolute', right: -16, top: -16,
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  // === SECTIONS ===
  section: { paddingHorizontal: SIZES.marginMobile, marginBottom: SIZES.xl },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: SIZES.md,
  },
  sectionTitle: { ...TYPO.h3, color: COLORS.textPrimary, marginBottom: SIZES.md },
  seeAllLink: { ...TYPO.caption, color: COLORS.primary, fontWeight: '700' },
  // === BENTO GRID ===
  bentoGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.md,
  },
  bentoTile: {
    width: (SCREEN_WIDTH - 2 * SIZES.marginMobile - SIZES.md) / 2,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.outlineVariant + '50',
    ...SHADOWS.small,
  },
  bentoTileWide: {
    width: '100%',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start',
  },
  bentoTileWideContent: { marginLeft: SIZES.md, flex: 1 },
  bentoIconCircle: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: SIZES.sm,
  },
  bentoTileLabel: { ...TYPO.h4, color: COLORS.textPrimary },
  bentoTileSubtitle: { ...TYPO.caption, color: COLORS.textSecondary, fontWeight: '400', marginTop: 2, fontSize: 11, letterSpacing: 0.2 },
  // === PARTNER CARDS (horizontal scroll, 260px wide each) ===
  partnerCard: {
    width: 260,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: SIZES.radiusLg,
    padding: SIZES.md,
    borderWidth: 1, borderColor: COLORS.outlineVariant + '60',
    ...SHADOWS.small,
  },
  partnerCardTop: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: SIZES.sm,
  },
  partnerAvatarWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.surfaceContainer,
    justifyContent: 'center', alignItems: 'center',
    marginRight: SIZES.sm,
  },
  partnerInfo: { flex: 1 },
  partnerName: { ...TYPO.h4, color: COLORS.textPrimary },
  partnerRatingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2,
  },
  partnerRating: { ...TYPO.caption, color: COLORS.textPrimary, fontSize: 12 },
  partnerReviews: { fontSize: 10, color: COLORS.textSecondary },
  partnerVerifiedBadge: { padding: 2 },
  partnerTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.xs, marginBottom: SIZES.md },
  partnerTag: {
    backgroundColor: COLORS.surfaceContainerHigh,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: SIZES.radiusFull,
  },
  partnerTagText: { fontSize: 10, color: COLORS.textPrimary, fontWeight: '500' },
  partnerCardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    borderTopWidth: 1, borderTopColor: COLORS.outlineVariant + '30',
    paddingTop: SIZES.sm, marginTop: SIZES.xs,
  },
  partnerPriceLabel: { fontSize: 10, color: COLORS.textSecondary },
  partnerPriceValue: { ...TYPO.body, fontWeight: '900', color: COLORS.primary, fontSize: 18, lineHeight: 20 },
  partnerPriceUnit: { fontSize: 12, fontWeight: '400', color: COLORS.textSecondary },
  partnerBookBtn: {
    backgroundColor: COLORS.surfaceContainerHigh,
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: SIZES.radiusSm,
    ...SHADOWS.small,
  },
  partnerBookBtnText: { ...TYPO.caption, color: COLORS.primary },
  // === ACTIVITY CARD (recent task) ===
  activityCard: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: SIZES.radiusLg,
    padding: SIZES.md,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.primary + '20',
    marginBottom: SIZES.sm,
    ...SHADOWS.small,
  },
  activityCardRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SIZES.md },
  activityIconCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.small,
  },
  activityCardContent: { flex: 1 },
  activityTitle: { ...TYPO.h4, color: COLORS.textPrimary, marginBottom: 4 },
  activityMeta: { fontSize: 11, color: COLORS.textSecondary },
  activityStatusChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: SIZES.radiusFull,
    borderWidth: 1, borderColor: COLORS.secondary + '20',
  },
  activityStatusText: { ...TYPO.caption, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  // === EMPTY STATE ===
  emptyBox: { alignItems: 'center', paddingVertical: 36, gap: 12 },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center', marginBottom: SIZES.sm,
    ...SHADOWS.small,
  },
  emptyTitle: { ...TYPO.h4, color: COLORS.textPrimary },
  emptyText: { ...TYPO.bodySmall, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  emptyBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd,
    paddingHorizontal: SIZES.lg, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', gap: SIZES.sm,
    ...SHADOWS.large,
    marginTop: SIZES.xs,
  },
  emptyBtnText: { color: '#fff', ...TYPO.button },
  // === UPGRADE BANNER ===
  upgradeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    padding: SIZES.md, marginBottom: SIZES.md,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary,
    ...SHADOWS.cardHover,
  },
  upgradeBannerIconCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  upgradeBannerInfo: { flex: 1 },
  upgradeBannerTitle: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  upgradeBannerDesc: { ...TYPO.caption, color: COLORS.textSecondary, marginTop: 2 },
  // === FAB (Floating Action Button — orange glow) ===
  fab: {
    position: 'absolute',
    bottom: 90, right: SIZES.marginMobile,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.large,
  },
});
