// ============================================================
// MyTasksScreen — Redesign theo Warm Professionalism (Stitch AI)
// Thay đổi:
// - Header: surface-container-low bg (ấm), title 'Nhiệm vụ của tôi'
//   + subtitle + bell + add FAB nhỏ
// - Tabs: 4 (Đang chờ, Đang diễn ra, Hoàn tất, Đã huỷ) — pill style
//   với bottom border active primary-container
// - Card: surface bg, radius 20, border outline-variant, top accent
//   bar 4px (màu theo status), icon circle + title + caption +
//   status chip + meta (calendar + carepartner) + price h3 primary +
//   actions row
// - Status colors giữ nguyên mapping (warning/primary/success/muted)
// - Background: surfaceWarm
// Giữ nguyên: getMyTasksAsParent, updateTaskStatus, getCandidates,
//   checkConsent, refresh control, navigation Candidates/Review/
//   PaymentSetup/LiveTracking
// ============================================================

import React, {useState, useEffect, useCallback, useRef} from 'react';
import {View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl, Alert, Platform, ScrollView, Animated} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getMyTasksAsParent, getCandidates, updateTaskStatus } from '../../api/tasks';
import { checkConsent } from '../../api/tracking';
import {COLORS, SHADOWS, SIZES, TYPO, ANIM} from '../../theme/colors';
import NotificationBell from '../../components/NotificationBell';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TABS = [
  { key: 'open',        label: 'Đang chờ' },
  { key: 'in_progress', label: 'Đang diễn ra' },
  { key: 'completed',   label: 'Hoàn tất' },
  { key: 'cancelled',   label: 'Đã huỷ' },
];

const STATUS_STYLE = {
  open: {
    label: 'Đang tìm CarePartner',
    text: COLORS.warning,
    bg: COLORS.warningBg,
    accent: '#F59E0B',
    iconBg: '#FFFBEB',
    icon: 'search',
  },
  in_progress: {
    label: 'Đang diễn ra',
    text: COLORS.primary,
    bg: COLORS.primaryLight,
    accent: COLORS.primary,
    iconBg: COLORS.primaryLight,
    icon: 'construct',
  },
  completed: {
    label: 'Hoàn thành',
    text: COLORS.success,
    bg: COLORS.successBg,
    accent: COLORS.success,
    iconBg: COLORS.successBg,
    icon: 'checkmark-circle',
  },
  cancelled: {
    label: 'Đã huỷ',
    text: COLORS.textMuted,
    bg: '#f3f4f6',
    accent: COLORS.textMuted,
    iconBg: '#f3f4f6',
    icon: 'close-circle',
  },
};

export default function MyTasksScreen() {
  const navigation = useNavigation();

  // QA-FIX-UI 3.2: fade-in animation khi mount (opacity 0→1)
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: ANIM.timingNormal,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState([]);
  const [activeTab, setActiveTab] = useState('open');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchTasks = async () => {
    try {
      const res = await getMyTasksAsParent();
      setTasks(res.data);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchTasks(); }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTasks();
  }, []);

  const handleStatusChange = (taskId, newStatus, taskTitle) => {
    const confirm = () => {
      Alert.alert(
        newStatus === 'completed' ? 'Hoàn thành công việc' : 'Huỷ công việc',
        newStatus === 'completed'
          ? `Xác nhận "${taskTitle}" đã hoàn thành? Tiền sẽ được giải ngân cho Carepartner.`
          : `Xác nhận huỷ "${taskTitle}"? Nếu đã thanh toán MoMo, tiền sẽ được hoàn lại.`,
        [
          { text: 'Huỷ', style: 'cancel' },
          {
            text: newStatus === 'completed' ? 'Hoàn thành' : 'Huỷ việc',
            style: newStatus === 'completed' ? 'default' : 'destructive',
            onPress: async () => {
              setActionLoading(`${taskId}-${newStatus}`);
              try {
                await updateTaskStatus(taskId, newStatus);
                Alert.alert('Thành công', newStatus === 'completed' ? 'Công việc đã hoàn thành.' : 'Công việc đã huỷ.');
                fetchTasks();
              } catch (e) {
                const msg = e.response?.data?.error || 'Thao tác thất bại.';
                Alert.alert('Lỗi', msg);
              } finally {
                setActionLoading(null);
              }
            }
          },
        ]
      );
    };
    confirm();
  };

  const handleSetupPayment = async (task) => {
    try {
      const candRes = await getCandidates(task.id);
      const accepted = candRes.data.find(c => c.status === 'accepted');
      navigation.navigate('PaymentSetup', {
        taskId: task.id,
        taskTitle: task.title,
        taskPrice: task.price,
      });
    } catch (e) {
      navigation.navigate('PaymentSetup', {
        taskId: task.id,
        taskTitle: task.title,
        taskPrice: task.price,
      });
    }
  };

  const filtered = tasks.filter(t => {
    if (activeTab === 'completed') return ['completed', 'cancelled'].includes(t.status);
    if (activeTab === 'cancelled') return t.status === 'cancelled';
    return t.status === activeTab;
  });

  const renderItem = ({ item: task }) => {
    const st = STATUS_STYLE[task.status] || STATUS_STYLE.open;
    const isCompleting = actionLoading === `${task.id}-completed`;
    const isCancelling = actionLoading === `${task.id}-cancelled`;

    return (
      <View style={styles.card}>
        {/* Top accent bar — màu theo status */}
        <View style={[styles.cardAccent, { backgroundColor: st.accent }]} />

        <View style={styles.cardBody}>
          {/* Top row: icon + title + status chip */}
          <View style={styles.cardTopRow}>
            <View style={[styles.cardIconCircle, { backgroundColor: st.iconBg }]}>
              <Ionicons name={st.icon} size={20} color={st.text} />
            </View>
            <View style={styles.cardTitleBlock}>
              <Text style={styles.cardTitle} numberOfLines={1}>{task.title}</Text>
              <Text style={styles.cardCaption} numberOfLines={1}>
                {task.location || 'Không có địa điểm'}
              </Text>
            </View>
            <View style={[styles.cardStatusChip, { backgroundColor: st.bg }]}>
              <Text style={[styles.cardStatusText, { color: st.text }]}>{st.label}</Text>
            </View>
          </View>

          {/* Info row — date + carepartner */}
          <View style={styles.cardInfoRow}>
            <View style={styles.cardInfoItem}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.onSurfaceVariant} />
              <Text style={styles.cardInfoText}>
                {new Date(task.scheduled_time).toLocaleString('vi-VN', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })}
              </Text>
            </View>
            {task.status === 'open' && (
              <View style={styles.cardInfoItem}>
                <Ionicons name="person-search-outline" size={14} color={COLORS.onSurfaceVariant} />
                <Text style={[styles.cardInfoText, { fontStyle: 'italic' }]}>Đang tìm CarePartner...</Text>
              </View>
            )}
          </View>

          {/* Footer: price + actions */}
          <View style={styles.cardFooter}>
            <Text style={styles.cardPrice}>
              {parseInt(task.price).toLocaleString('vi-VN')}đ
            </Text>

            {/* Action buttons theo trạng thái */}
            {task.status === 'open' && (
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.btnOutline}
                  onPress={() => navigation.navigate('Candidates', { taskId: task.id, taskTitle: task.title })}
                  activeOpacity={0.85}
                >
                  <Text style={styles.btnOutlineText}>Xem ứng viên</Text>
                  <Ionicons name="chevron-forward" size={14} color={COLORS.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnGhost}
                  onPress={() => handleStatusChange(task.id, 'cancelled', task.title)}
                  disabled={isCancelling}
                  activeOpacity={0.85}
                >
                  {isCancelling ? (
                    <ActivityIndicator size="small" color={COLORS.error} />
                  ) : (
                    <Text style={styles.btnGhostText}>Huỷ</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {task.status === 'in_progress' && (
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={() => handleStatusChange(task.id, 'completed', task.title)}
                  disabled={isCompleting}
                  activeOpacity={0.85}
                >
                  {isCompleting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={16} color="#fff" />
                      <Text style={styles.btnPrimaryText}>Hoàn thành</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Secondary actions — payment + tracking */}
          {task.status === 'in_progress' && (
            <View style={styles.secondaryActions}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => navigation.navigate('Candidates', { taskId: task.id, taskTitle: task.title })}
                activeOpacity={0.85}
              >
                <Ionicons name="people-outline" size={14} color={COLORS.primary} />
                <Text style={styles.secondaryBtnText}>Xem người làm</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => handleSetupPayment(task)}
                activeOpacity={0.85}
              >
                <Ionicons name="wallet-outline" size={14} color={COLORS.primary} />
                <Text style={styles.secondaryBtnText}>Thanh toán</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={async () => {
                  try {
                    const res = await checkConsent(task.id);
                    const consent = res.data?.consent?.consent || res.data?.consent;
                    if (res.data?.has_consent && consent === 'granted') {
                      navigation.navigate('LiveTracking', {
                        taskId: task.id,
                        taskTitle: task.title,
                        taskLatitude: task.latitude,
                        taskLongitude: task.longitude,
                      });
                    } else if (res.data?.has_consent && consent === 'revoked') {
                      Alert.alert('Đã dừng', 'Carepartner đã dừng chia sẻ vị trí. Vui lòng liên hệ trực tiếp.');
                    } else {
                      Alert.alert('Chưa có vị trí', 'Carepartner chưa đồng ý chia sẻ vị trí cho việc này.');
                    }
                  } catch (e) {
                    Alert.alert('Lỗi', 'Không thể kiểm tra trạng thái theo dõi. Vui lòng thử lại.');
                  }
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="location" size={14} color={COLORS.primary} />
                <Text style={styles.secondaryBtnText}>Theo dõi</Text>
              </TouchableOpacity>
              {/* QA-FIX-GAP-4: Entry point vào CareDiaryDetail (Nhóm B) */}
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => navigation.navigate('CareDiaryDetail', { taskId: task.id, taskTitle: task.title })}
                activeOpacity={0.85}
              >
                <Ionicons name="book-outline" size={14} color={COLORS.primary} />
                <Text style={styles.secondaryBtnText}>Nhật ký</Text>
              </TouchableOpacity>
              {/* QA-FIX-GAP-4: Entry point vào CancellationPolicy (Nhóm B) */}
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => navigation.navigate('CancellationPolicy', { taskId: task.id })}
                activeOpacity={0.85}
              >
                <Ionicons name="document-text-outline" size={14} color={COLORS.primary} />
                <Text style={styles.secondaryBtnText}>Chính sách huỷ</Text>
              </TouchableOpacity>
            </View>
          )}

          {task.status === 'completed' && (
            <>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={async () => {
                  try {
                    const candRes = await getCandidates(task.id);
                    const accepted = candRes.data.find(c => c.status === 'accepted');
                    navigation.navigate('Review', {
                      taskId: task.id,
                      revieweeId: accepted ? accepted.worker : null
                    });
                  } catch (e) {
                    navigation.navigate('Review', { taskId: task.id });
                  }
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="star-outline" size={16} color="#fff" />
                <Text style={styles.btnPrimaryText}>Đánh giá Carepartner</Text>
              </TouchableOpacity>
              {/* QA-FIX-GAP-4: Entry point vào CareDiaryDetail (Nhóm B) cho task đã hoàn thành */}
              <View style={styles.secondaryActions}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => navigation.navigate('CareDiaryDetail', { taskId: task.id, taskTitle: task.title })}
                  activeOpacity={0.85}
                >
                  <Ionicons name="book-outline" size={14} color={COLORS.primary} />
                  <Text style={styles.secondaryBtnText}>Xem nhật ký chăm sóc</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceWarm} />

      {/* Header — surface-container-low bg */}
      <View style={[styles.header, { paddingTop: insets.top + 32 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Nhiệm vụ của tôi</Text>
          <Text style={styles.headerSubtitle}>Quản lý và theo dõi các dịch vụ chăm sóc.</Text>
        </View>
        <View style={styles.headerRight}>
          <NotificationBell color={COLORS.primary} />
          <TouchableOpacity
            onPress={() => navigation.navigate('CreateTask')}
            style={styles.addBtn}
          >
            <Ionicons name="add" size={22} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs — pill style với bottom border active */}
      <View style={styles.tabsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="document-outline" size={40} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>Không có việc nào</Text>
              <Text style={styles.emptyText}>Trong mục này chưa có việc nào. Hãy đăng việc mới để bắt đầu!</Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => navigation.navigate('CreateTask')}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle" size={18} color="#fff" />
                <Text style={styles.emptyBtnText}>Đăng việc ngay</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  // === HEADER ===
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: COLORS.surfaceContainerLow, // surface-container-low (ấm)
  },
  headerLeft: { flex: 1, marginRight: 12 },
  headerTitle: {
    ...TYPO.h1,
    color: COLORS.onSurface,
    marginBottom: 4,
  },
  headerSubtitle: {
    ...TYPO.body,
    color: COLORS.onSurfaceVariant,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceContainer,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  // === TABS ===
  tabsRow: {
    backgroundColor: COLORS.surfaceContainerLow,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  tabsScroll: {
    paddingHorizontal: 12,
    gap: 4,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.primary, // primary-container
  },
  tabText: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  // === LIST ===
  list: { padding: 20, gap: 12 },
  // === CARD ===
  card: {
    backgroundColor: COLORS.surface, // surface-container-lowest
    borderRadius: 20, // 2xl radius
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    overflow: 'hidden',
    ...SHADOWS.small,
  },
  cardAccent: {
    height: 4,
    width: '100%',
  },
  cardBody: {
    padding: 16,
    gap: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitleBlock: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    ...TYPO.h4,
    color: COLORS.onSurface,
  },
  cardCaption: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
  },
  cardStatusChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  cardStatusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // === INFO ROW ===
  cardInfoRow: {
    gap: 6,
    backgroundColor: COLORS.surfaceContainerLow, // surface-bright
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  cardInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardInfoText: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    flex: 1,
  },
  // === FOOTER ===
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
  },
  cardPrice: {
    ...TYPO.h3,
    color: COLORS.primary,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  // === BUTTONS ===
  btnPrimary: {
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    height: 40,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    ...SHADOWS.small,
  },
  btnPrimaryText: {
    ...TYPO.caption,
    color: '#ffffff',
    fontWeight: '700',
  },
  btnOutline: {
    borderRadius: 999,
    height: 40,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  btnOutlineText: {
    ...TYPO.caption,
    color: COLORS.primary,
    fontWeight: '700',
  },
  btnGhost: {
    borderRadius: 999,
    height: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  btnGhostText: {
    ...TYPO.caption,
    color: COLORS.error,
    fontWeight: '700',
  },
  // === SECONDARY ACTIONS ===
  secondaryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  secondaryBtnText: {
    ...TYPO.caption,
    color: COLORS.primary,
    fontWeight: '700',
  },
  // === EMPTY STATE ===
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 4, ...SHADOWS.small,
  },
  emptyTitle: { ...TYPO.h4, color: COLORS.onSurface },
  emptyText: { ...TYPO.bodySmall, color: COLORS.onSurfaceVariant, textAlign: 'center', paddingHorizontal: 20 },
  emptyBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...SHADOWS.large,
    marginTop: 8,
  },
  emptyBtnText: {
    ...TYPO.button,
    color: '#fff',
  },
});
