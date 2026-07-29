import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated,
  StatusBar, Alert, ActivityIndicator, RefreshControl, Platform, Dimensions
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getMyTasksAsParent } from '../../api/tasks';
import NotificationBell from '../../components/NotificationBell';
import { COLORS, SHADOWS, SIZES, TYPO, ANIM } from '../../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CATEGORY_SIZE = (SCREEN_WIDTH - 48 - 36) / 4;

const STATUS_MAPPING = {
  open: { label: 'Đang tìm', color: COLORS.warning, bg: COLORS.warningBg, icon: 'search' },
  in_progress: { label: 'Đang làm', color: COLORS.primary, bg: COLORS.primaryLight, icon: 'construct' },
  completed: { label: 'Hoàn thành', color: COLORS.success, bg: COLORS.successBg, icon: 'checkmark-circle' },
  cancelled:   { label: 'Đã huỷ',   color: COLORS.textMuted, bg: '#f3f4f6', icon: 'close-circle' },
};

// Sync 100% với web parent_home.html (Material Symbols → Ionicons)
const CATEGORIES = [
  { id: 1, iconName: 'book', name: 'Gia sư', color: COLORS.primary },
  { id: 2, iconName: 'happy', name: 'Đón trẻ', color: COLORS.primary },
  { id: 3, iconName: 'sparkles', name: 'Dọn dẹp', color: COLORS.primary },
  { id: 4, iconName: 'people', name: 'Trông trẻ', color: COLORS.primary },
  { id: 5, iconName: 'bag', name: 'Mua sắm', color: COLORS.primary },
  { id: 6, iconName: 'restaurant', name: 'Nấu ăn', color: COLORS.primary },
  { id: 7, iconName: 'cube', name: 'Chuyển đồ', color: COLORS.primary },
  { id: 8, iconName: 'apps', name: 'Khác', color: COLORS.primary },
];

export default function ParentHomeScreen() {
  const navigation = useNavigation();
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fix H12: store animation ref và stop() trong cleanup để tránh memory leak.
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
      const list = Array.isArray(res.data) ? res.data : [];
      setAllTasks(list);
      setTasks(list.slice(0, 3));
    } catch (e) {
      console.error('Lỗi tải danh sách việc:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchTasks(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchTasks(); };

  // Stats đồng bộ web parent_home.html: Tổng / Đang tìm / Đang thực hiện
  const stats = {
    total: allTasks.length,
    open: allTasks.filter((t) => t.status === 'open').length,
    inProgress: allTasks.filter((t) => t.status === 'in_progress').length,
  };

  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : user?.username || 'Phụ huynh';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      <View style={styles.header}>
        <View style={styles.headerGradientOverlay} />
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greetSmall}>Xin chào 👋</Text>
            <Text style={styles.greetName}>{displayName}</Text>
          </View>
          <View style={styles.headerRight}>
            <NotificationBell />
            <TouchableOpacity onPress={() => {
              if (Platform.OS === 'web') {
                if (window.confirm('Bạn có chắc chắn muốn đăng xuất?')) {
                  logout();
                }
              } else {
                Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất?', [
                  { text: 'Huỷ', style: 'cancel' },
                  { text: 'Đăng xuất', style: 'destructive', onPress: logout },
                ]);
              }
            }} style={styles.headerIconBtn}>
              <Ionicons name="log-out-outline" size={22} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.searchBar} onPress={() => navigation.navigate('CreateTask')} activeOpacity={0.9}>
          <View style={styles.searchIconCircle}>
            <Ionicons name="add" size={24} color={COLORS.primary} />
          </View>
          <View style={styles.searchTextGroup}>
            <Text style={styles.searchTitle}>Bạn cần tìm dịch vụ gì?</Text>
            <Text style={styles.searchSub}>Đăng việc ngay để tìm Carepartner</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {/* Stats row — đồng bộ web parent_home.html */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: COLORS.primaryLight }]}>
              <Ionicons name="checkmark-done" size={18} color={COLORS.primary} />
            </View>
            <Text style={styles.statValue}>{isLoading ? '—' : stats.total}</Text>
            <Text style={styles.statLabel}>Tổng việc đã đăng</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: COLORS.warningBg }]}>
              <Ionicons name="search" size={18} color={COLORS.warning} />
            </View>
            <Text style={styles.statValue}>{isLoading ? '—' : stats.open}</Text>
            <Text style={styles.statLabel}>Đang tìm Carepartner</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: COLORS.infoBg }]}>
              <Ionicons name="time" size={18} color={COLORS.info} />
            </View>
            <Text style={styles.statValue}>{isLoading ? '—' : stats.inProgress}</Text>
            <Text style={styles.statLabel}>Đang thực hiện</Text>
          </View>
        </View>

        {/* CTA ĐĂNG VIỆC NGAY — đồng bộ web */}
        <TouchableOpacity
          style={styles.ctaCard}
          onPress={() => navigation.navigate('CreateTask')}
          activeOpacity={0.9}
        >
          <View style={styles.ctaIconCircle}>
            <Ionicons name="add-circle" size={28} color="#fff" />
          </View>
          <View style={styles.ctaContent}>
            <Text style={styles.ctaTitle}>ĐĂNG VIỆC NGAY</Text>
            <Text style={styles.ctaSubtitle}>
              Tìm Carepartner nhanh chóng & tin cậy cho bé yêu của bạn
            </Text>
          </View>
          <View style={styles.ctaBtn}>
            <Text style={styles.ctaBtnText}>Bắt đầu</Text>
            <Ionicons name="arrow-forward" size={14} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* Section: Danh mục dịch vụ */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Dịch vụ</Text>
            <TouchableOpacity onPress={() => navigation.navigate('CreateTask')}>
              <Text style={styles.seeAll}>Xem tất cả</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.categoriesGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity key={cat.name} style={styles.catItem}
                onPress={() => navigation.navigate('CreateTask')}
                activeOpacity={0.7}
              >
                <View style={[styles.catIconBg, { backgroundColor: cat.color + '15' }]}>
                  <Ionicons name={cat.iconName} size={28} color={cat.color} />
                </View>
                <Text style={styles.catName}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* AI Chatbot Banner — đồng bộ với web parent_home.html */}
        <TouchableOpacity
          style={styles.aiBanner}
          onPress={() => navigation.navigate('Chatbot')}
          activeOpacity={0.9}
        >
          <View style={styles.aiBannerIconWrap}>
            <Ionicons name="sparkles" size={26} color="#fff" />
          </View>
          <View style={styles.aiBannerContent}>
            <View style={styles.aiBannerTitleRow}>
              <Text style={styles.aiBannerTitle}>Nhờ AI đăng việc hộ</Text>
              <View style={styles.aiBadgeNew}>
                <View style={styles.aiBadgeDot} />
                <Text style={styles.aiBadgeText}>MỚI</Text>
              </View>
            </View>
            <Text style={styles.aiBannerSubtitle} numberOfLines={2}>
              Chỉ cần nói "Tôi cần gia sư Toán lớp 5" — AI sẽ tạo việc giúp bạn trong vài giây!
            </Text>
          </View>
          <View style={styles.aiBannerCta}>
            <Text style={styles.aiBannerCtaText}>Chat ngay</Text>
            <Ionicons name="arrow-forward" size={14} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* Section: Việc gần đây */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Việc gần đây</Text>
            <TouchableOpacity onPress={() => navigation.navigate('MyTasks')}>
              <Text style={styles.seeAll}>Xem tất cả</Text>
            </TouchableOpacity>
          </View>

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
                <TouchableOpacity key={task.id} style={[styles.taskCard, { borderLeftColor: st.color }]}
                  onPress={() => navigation.navigate('MyTasks')}
                  activeOpacity={0.9}>
                  <View style={styles.taskCardRow}>
                    <View style={[styles.taskIconCircle, { backgroundColor: st.bg }]}>
                      <Ionicons name={st.icon} size={20} color={st.color} />
                    </View>
                    <View style={styles.taskCardContent}>
                      <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                        <View style={[styles.statusDot, { backgroundColor: st.color }]} />
                        <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                      </View>
                      <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
                      <View style={styles.taskMetaRow}>
                        <Ionicons name="location-outline" size={12} color={COLORS.textMuted} />
                        <Text style={styles.taskMeta} numberOfLines={1}>{task.location}</Text>
                      </View>
                    </View>
                    <Text style={styles.taskPrice}>
                      {parseInt(task.price).toLocaleString('vi-VN')}đ
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20,
    borderBottomLeftRadius: SIZES.radiusLg, borderBottomRightRadius: SIZES.radiusLg,
    overflow: 'hidden',
    ...SHADOWS.large,
  },
  headerGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderBottomLeftRadius: SIZES.radiusLg,
    borderBottomRightRadius: SIZES.radiusLg,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  greetSmall: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  greetName: { color: '#fff', ...TYPO.h2 },
  headerRight: { flexDirection: 'row', gap: SIZES.sm },
  headerIconBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  searchBar: {
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: SIZES.radiusMd, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderColor: COLORS.primarySoft,
  },
  searchIconCircle: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.small,
  },
  searchTextGroup: { flex: 1 },
  searchTitle: { color: '#fff', ...TYPO.bodyLarge },
  searchSub: { color: 'rgba(255,255,255,0.7)', ...TYPO.bodySmall, marginTop: 2 },
  body: { flex: 1, marginTop: -4 },
  // Stats — match web parent_home
  statsRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, marginTop: SIZES.lg,
  },
  statCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    padding: 12, alignItems: 'center', gap: 4,
    ...SHADOWS.cardHover,
  },
  statIconWrap: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', marginBottom: 2,
  },
  statValue: { ...TYPO.h3, color: COLORS.textPrimary, fontWeight: '900' },
  statLabel: { ...TYPO.caption, color: COLORS.textSecondary, textAlign: 'center', fontSize: 10 },
  // CTA card
  ctaCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 20, marginTop: SIZES.md,
    padding: 16, borderRadius: 16,
    backgroundColor: COLORS.primary,
    ...SHADOWS.large,
  },
  ctaIconCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  ctaContent: { flex: 1, gap: 2 },
  ctaTitle: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
  ctaSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 11, lineHeight: 16 },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  ctaBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  section: { paddingHorizontal: 20, marginTop: SIZES.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SIZES.md },
  sectionTitle: { ...TYPO.h3, color: COLORS.textPrimary },
  seeAll: { color: COLORS.primary, ...TYPO.buttonSmall },
  categoriesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  catItem: {
    width: CATEGORY_SIZE, alignItems: 'center', gap: SIZES.sm,
  },
  catIconBg: {
    width: CATEGORY_SIZE - 8, height: CATEGORY_SIZE - 8,
    borderRadius: SIZES.radiusMd, justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.cardHover,
    backgroundColor: COLORS.surface,
  },
  catName: { ...TYPO.bodySmall, color: COLORS.textSecondary, textAlign: 'center' },
  taskCard: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: SIZES.md,
    marginBottom: 10, borderLeftWidth: 4, borderLeftColor: COLORS.primary,
    ...SHADOWS.cardHover,
  },
  taskCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  taskIconCircle: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  taskCardContent: { flex: 1, gap: SIZES.xs },
  statusBadge: {
    alignSelf: 'flex-start', borderRadius: SIZES.radiusXs, paddingHorizontal: 10, paddingVertical: 4,
    flexDirection: 'row', alignItems: 'center', gap: SIZES.xs,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { ...TYPO.caption },
  taskTitle: { ...TYPO.h5, color: COLORS.textPrimary },
  taskMetaRow: { flexDirection: 'row', alignItems: 'center', gap: SIZES.xs },
  taskMeta: { ...TYPO.bodySmall, color: COLORS.textMuted, flex: 1 },
  taskPrice: { ...TYPO.bodyLarge, fontWeight: '900', color: COLORS.primary },
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
  upgradeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    padding: SIZES.md, marginBottom: 12,
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
  aiBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 20, marginTop: SIZES.lg, marginBottom: SIZES.sm,
    padding: 14, borderRadius: 16,
    backgroundColor: '#EEF2FF',
    borderWidth: 1, borderColor: '#E0E7FF',
    ...SHADOWS.card,
  },
  aiBannerIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#6366F1',
    justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.small,
  },
  aiBannerContent: { flex: 1, gap: 3 },
  aiBannerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiBannerTitle: { ...TYPO.h5, color: '#312E81', fontWeight: '700', fontSize: 15 },
  aiBadgeNew: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#6366F1', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  aiBadgeDot: {
    width: 5, height: 5, borderRadius: 3, backgroundColor: '#6EE7B7',
  },
  aiBadgeText: {
    fontSize: 9, color: '#fff', fontWeight: '800', letterSpacing: 0.5,
  },
  aiBannerSubtitle: {
    ...TYPO.caption, color: '#4338CA', lineHeight: 16, fontSize: 11,
  },
  aiBannerCta: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#6366F1', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  aiBannerCtaText: {
    color: '#fff', fontSize: 11, fontWeight: '700',
  },
});
