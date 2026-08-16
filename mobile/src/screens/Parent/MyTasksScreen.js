import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl, Alert, Platform, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getMyTasksAsParent, getCandidates, updateTaskStatus } from '../../api/tasks';
import { checkConsent } from '../../api/tracking';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';
import NotificationBell from '../../components/NotificationBell';

// === Tabs (3-tab structure preserved; only labels updated to match design wording) ===
// Filter logic in `filtered` const is unchanged — completed tab still includes cancelled tasks.
const TABS = [
  { key: 'open',        label: 'Đang chờ' },
  { key: 'in_progress', label: 'Đang diễn ra' },
  { key: 'completed',   label: 'Hoàn tất' },
];

// === Status visual config (maps each task.status to design tokens) ===
const STATUS_STYLE = {
  open: {
    label: 'Đang chờ',
    barColor:    COLORS.warning,            // #F59E0B — 4px status bar
    iconBg:      COLORS.warningBg,          // #FFFBEB — icon circle bg
    iconColor:   COLORS.warning,            // #F59E0B — icon color
    iconName:    'time-outline',
    chipBg:      COLORS.warningBg,          // #FFFBEB — status chip bg
    chipText:    COLORS.warningDeep,        // #B45309 — status chip text
    chipIcon:    'time-outline',
    priceColor:  COLORS.primary,            // vibrant orange for price
  },
  in_progress: {
    label: 'Đang diễn ra',
    barColor:    COLORS.tertiaryContainer,   // #009ADE — 4px status bar
    iconBg:      COLORS.tertiaryFixed,      // #CAE6FF — icon circle bg
    iconColor:   COLORS.tertiary,           // #006492 — icon color
    iconName:    'play-circle-outline',
    chipBg:      COLORS.tertiaryFixed,      // #CAE6FF — status chip bg
    chipText:    COLORS.tertiary,           // #006492 — status chip text
    chipIcon:    'radio-button-on',
    priceColor:  COLORS.primary,
  },
  completed: {
    label: 'Hoàn tất',
    barColor:    COLORS.secondaryDeep,      // #006E24 — 4px status bar
    iconBg:      COLORS.successBgDeep,      // #EAFBEF — icon circle bg
    iconColor:   COLORS.successDeep,        // #1E9439 — icon color
    iconName:    'checkmark-circle-outline',
    chipBg:      COLORS.successBgDeep,      // #EAFBEF — status chip bg
    chipText:    COLORS.successDeep,        // #1E9439 — status chip text
    chipIcon:    'checkmark-circle',
    priceColor:  COLORS.textSecondary,      // muted price for completed
  },
  cancelled: {
    label: 'Đã huỷ',
    barColor:    COLORS.textMuted,          // muted gray — 4px status bar
    iconBg:      '#F3F4F6',                 // muted gray bg
    iconColor:   COLORS.textMuted,
    iconName:    'close-circle-outline',
    chipBg:      '#F3F4F6',
    chipText:    COLORS.textMuted,
    chipIcon:    'close-circle',
    priceColor:  COLORS.textMuted,
  },
};

// === Category icon mapping (matches CreateTaskScreen CATEGORIES) ===
// Used for the 40x40 icon circle inside each task card.
const CATEGORY_ICON = {
  1: 'book',
  2: 'happy',
  3: 'sparkles',
  4: 'people',
  5: 'bag',
  6: 'restaurant',
  7: 'cube',
  8: 'apps',
};

export default function MyTasksScreen() {
  const navigation = useNavigation();
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
                Alert.alert('✅ Thành công', newStatus === 'completed' ? 'Công việc đã hoàn thành.' : 'Công việc đã huỷ.');
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
    // Lấy worker được accept (nếu có)
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
    return t.status === activeTab;
  });

  // === Task Card Renderer ===
  const renderItem = ({ item: task }) => {
    const st = STATUS_STYLE[task.status] || STATUS_STYLE.open;
    const isCompleting = actionLoading === `${task.id}-completed`;
    const isCancelling = actionLoading === `${task.id}-cancelled`;
    const catIcon = CATEGORY_ICON[task.category] || 'briefcase';
    const carepartnerName = task.carepartner_name;
    const isMuted = task.status === 'completed' || task.status === 'cancelled';

    return (
      <View style={styles.card}>
        {/* 4px colored status bar at top of card */}
        <View style={[styles.statusBar, { backgroundColor: st.barColor }]} />

        {/* Top section: icon circle + title/meta + status chip */}
        <View style={styles.cardTop}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.iconCircle, { backgroundColor: st.iconBg }]}>
              <Ionicons name={catIcon} size={20} color={st.iconColor} />
            </View>
            <View style={styles.titleBlock}>
              <Text style={[styles.taskTitle, isMuted && styles.taskTitleMuted]} numberOfLines={1}>
                {task.title}
              </Text>
              <Text style={styles.taskSubtitle} numberOfLines={1}>{task.location}</Text>
            </View>
          </View>
          <View style={[styles.statusChip, { backgroundColor: st.chipBg }]}>
            <Ionicons name={st.chipIcon} size={12} color={st.chipText} />
            <Text style={[styles.statusChipText, { color: st.chipText }]}>{st.label}</Text>
          </View>
        </View>

        {/* Info box (cream bg): date/time + CarePartner */}
        <View style={styles.infoBox}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={16} color={COLORS.textSecondary} />
            <Text
              style={[styles.infoText, isMuted && styles.infoTextMuted]}
              numberOfLines={1}
            >
              {new Date(task.scheduled_time).toLocaleString('vi-VN')}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons
              name={task.status === 'open' ? 'person-outline' : 'person-circle-outline'}
              size={16}
              color={COLORS.textSecondary}
            />
            {task.status === 'open' ? (
              <Text style={styles.infoTextItalic} numberOfLines={1}>
                Đang tìm CarePartner...
              </Text>
            ) : (
              <Text
                style={[styles.infoText, isMuted && styles.infoTextMuted]}
                numberOfLines={1}
              >
                {carepartnerName ? `${carepartnerName} (CarePartner)` : 'CarePartner đã được giao'}
              </Text>
            )}
          </View>
        </View>

        {/* Footer: price + action buttons */}
        <View style={styles.cardFooter}>
          <Text style={[styles.price, { color: st.priceColor }]}>
            {parseInt(task.price).toLocaleString('vi-VN')}đ
          </Text>

          {/* Action buttons theo trạng thái — all logic preserved verbatim */}
          {task.status === 'open' && (
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.chipBtn, styles.chipBtnPrimaryOutline]}
                onPress={() => navigation.navigate('Candidates', { taskId: task.id, taskTitle: task.title })}
                activeOpacity={0.85}
              >
                <Ionicons name="people-outline" size={14} color={COLORS.primary} />
                <Text style={styles.chipBtnPrimaryText}>Xem ứng viên</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chipBtn, styles.chipBtnDangerOutline]}
                onPress={() => handleStatusChange(task.id, 'cancelled', task.title)}
                disabled={isCancelling}
                activeOpacity={0.85}
              >
                {isCancelling ? (
                  <ActivityIndicator size="small" color={COLORS.error} />
                ) : (
                  <>
                    <Ionicons name="close-circle-outline" size={14} color={COLORS.error} />
                    <Text style={styles.chipBtnDangerText}>Huỷ</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {task.status === 'in_progress' && (
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.chipBtn, styles.chipBtnPrimaryOutline]}
                onPress={() => navigation.navigate('Candidates', { taskId: task.id, taskTitle: task.title })}
                activeOpacity={0.85}
              >
                <Ionicons name="people-outline" size={14} color={COLORS.primary} />
                <Text style={styles.chipBtnPrimaryText}>Xem người làm</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chipBtn, styles.chipBtnSuccessFilled]}
                onPress={() => handleStatusChange(task.id, 'completed', task.title)}
                disabled={isCompleting}
                activeOpacity={0.85}
              >
                {isCompleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={14} color="#fff" />
                    <Text style={styles.chipBtnFilledText}>Hoàn thành</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Setup payment button — chỉ hiện cho in_progress chưa có payment */}
          {task.status === 'in_progress' && (
            <TouchableOpacity
              style={styles.paymentBtn}
              onPress={() => handleSetupPayment(task)}
              activeOpacity={0.85}
            >
              <Ionicons name="wallet-outline" size={14} color={COLORS.primary} />
              <Text style={styles.paymentBtnText}>Thiết lập thanh toán (MoMo/Tiền mặt)</Text>
            </TouchableOpacity>
          )}

          {/* Live tracking button — chỉ hiện cho in_progress */}
          {task.status === 'in_progress' && (
            <TouchableOpacity
              style={styles.trackBtn}
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
                    Alert.alert('⚠️ Đã dừng', 'Carepartner đã dừng chia sẻ vị trí. Vui lòng liên hệ trực tiếp.');
                  } else {
                    Alert.alert(
                      'Chưa có vị trí',
                      'Carepartner chưa đồng ý chia sẻ vị trí cho việc này.',
                    );
                  }
                } catch (e) {
                  Alert.alert('Lỗi', 'Không thể kiểm tra trạng thái theo dõi. Vui lòng thử lại.');
                }
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="location" size={16} color="#fff" />
              <Text style={styles.trackBtnText}>Theo dõi vị trí Carepartner</Text>
              <Ionicons name="chevron-forward" size={14} color="#fff" />
            </TouchableOpacity>
          )}

          {task.status === 'completed' && (
            <TouchableOpacity
              style={[styles.chipBtn, styles.chipBtnSurface]}
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
              <Ionicons name="star-outline" size={14} color={COLORS.textSecondary} />
              <Text style={styles.chipBtnSurfaceText}>Đánh giá Carepartner</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceContainerLowest} />

      {/* === Top App Bar (white bg) === */}
      <View style={styles.topAppBar}>
        <View style={styles.appBarLeft}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={20} color={COLORS.primary} />
          </View>
          <Text style={styles.appBarTitle}>EduCareLink</Text>
        </View>
        <View style={styles.appBarRight}>
          <NotificationBell
            color={COLORS.primary}
            style={styles.bellBtn}
          />
          <TouchableOpacity
            onPress={() => navigation.navigate('CreateTask')}
            style={styles.addBtn}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={22} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* === Header Section === */}
      <View style={styles.headerSection}>
        <Text style={styles.headerH1}>Nhiệm vụ của tôi</Text>
        <Text style={styles.headerSubtitle}>Quản lý và theo dõi các dịch vụ chăm sóc.</Text>
      </View>

      {/* === Tabs (horizontal scroll, underline style) === */}
      <View style={styles.tabsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScroll}
        >
          {TABS.map(tab => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* === Task List === */}
      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} size="large" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="document-text-outline" size={40} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>Không có nhiệm vụ nào</Text>
              <Text style={styles.emptyText}>Trong mục này chưa có nhiệm vụ nào.</Text>
              <TouchableOpacity
                style={styles.emptyCta}
                onPress={() => navigation.navigate('CreateTask')}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle-outline" size={16} color={COLORS.primary} />
                <Text style={styles.emptyCtaText}>Tạo nhiệm vụ mới</Text>
              </TouchableOpacity>
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
    backgroundColor: COLORS.background,            // warm cream #FFF8F6
  },

  // === Top App Bar ===
  topAppBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SIZES.marginMobile,
    paddingVertical: SIZES.sm,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    backgroundColor: COLORS.surfaceContainerLowest,  // pure white #FFFFFF
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,        // #E1BFB3
  },
  appBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryLight,            // warm tint #FFF4ED
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appBarTitle: {
    ...TYPO.h2,
    color: COLORS.primaryText,                       // dark warm orange #A63B00
  },
  appBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
  },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceContainerLow,     // #FFF1EC
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // === Header Section ===
  headerSection: {
    paddingHorizontal: SIZES.marginMobile,
    paddingTop: SIZES.md,
    paddingBottom: SIZES.md,
  },
  headerH1: {
    ...TYPO.h1,
    color: COLORS.textPrimary,                       // #261813
    marginBottom: SIZES.xs,
  },
  headerSubtitle: {
    ...TYPO.body,
    color: COLORS.textSecondary,                     // #594138
  },

  // === Tabs ===
  tabsRow: {
    paddingHorizontal: SIZES.marginMobile,
    marginBottom: SIZES.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceContainerHighest,  // #F7DDD4
  },
  tabsScroll: {
    gap: SIZES.sm,
    paddingBottom: SIZES.xs,
  },
  tab: {
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    borderRadius: SIZES.radiusSm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.primary,               // #F26522 orange underline
    backgroundColor: 'rgba(242, 101, 34, 0.08)',     // light orange tint
  },
  tabText: {
    ...TYPO.caption,
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primary,
  },

  // === Task List ===
  list: {
    paddingHorizontal: SIZES.marginMobile,
    paddingBottom: SIZES.xl,
    gap: SIZES.md,
  },

  // === Task Card ===
  card: {
    backgroundColor: COLORS.surfaceContainerLowest,  // pure white
    borderRadius: SIZES.radiusLg,                    // 20
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(225, 191, 179, 0.4)',         // outlineVariant at 30% opacity
    ...SHADOWS.cardHover,
  },
  statusBar: {
    height: 4,
    width: '100%',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: SIZES.md,
    paddingBottom: SIZES.sm,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    flex: 1,
    paddingRight: SIZES.sm,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  taskTitle: {
    ...TYPO.h4,
    color: COLORS.textPrimary,
  },
  taskTitleMuted: {
    opacity: 0.7,
  },
  taskSubtitle: {
    ...TYPO.caption,
    color: COLORS.textSecondary,
    letterSpacing: 0.2,
    fontWeight: '500',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.xs,
    paddingHorizontal: SIZES.sm,
    paddingVertical: SIZES.xs,
    borderRadius: SIZES.radiusFull,                  // 999 (chip style)
  },
  statusChipText: {
    ...TYPO.caption,
    fontSize: 11,
  },

  // === Info Box (cream bg) ===
  infoBox: {
    backgroundColor: COLORS.surfaceContainerLow,    // #FFF1EC cream
    borderRadius: SIZES.radiusMd,                    // 14
    padding: SIZES.sm,
    marginHorizontal: SIZES.md,
    marginBottom: SIZES.sm,
    gap: SIZES.xs,
    borderWidth: 1,
    borderColor: COLORS.surfaceContainer,            // #FFE9E2
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
  },
  infoText: {
    ...TYPO.bodySmall,
    color: COLORS.textSecondary,
    flex: 1,
  },
  infoTextMuted: {
    opacity: 0.6,
    textDecorationLine: 'line-through',
  },
  infoTextItalic: {
    ...TYPO.bodySmall,
    fontStyle: 'italic',
    color: COLORS.textSecondary,
    opacity: 0.7,
    flex: 1,
  },

  // === Card Footer ===
  cardFooter: {
    flexDirection: 'column',
    gap: SIZES.xs,
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.md,
  },
  price: {
    ...TYPO.h3,
    fontWeight: '900',
    marginBottom: SIZES.xs,
  },

  // === Buttons (chip style, radiusFull) ===
  btnRow: {
    flexDirection: 'row',
    gap: SIZES.sm,
  },
  chipBtn: {
    flex: 1,
    height: 38,
    borderRadius: SIZES.radiusFull,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SIZES.sm,
  },
  chipBtnPrimaryOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  chipBtnPrimaryText: {
    ...TYPO.caption,
    fontSize: 11,
    color: COLORS.primary,
  },
  chipBtnDangerOutline: {
    backgroundColor: COLORS.errorBg,
    borderWidth: 1.5,
    borderColor: '#FECACA',
  },
  chipBtnDangerText: {
    ...TYPO.caption,
    fontSize: 11,
    color: COLORS.error,
  },
  chipBtnSuccessFilled: {
    backgroundColor: COLORS.successDeep,             // #1E9439
    ...SHADOWS.small,
  },
  chipBtnFilledText: {
    ...TYPO.caption,
    fontSize: 11,
    color: '#fff',
  },
  chipBtnSurface: {
    backgroundColor: COLORS.surfaceContainer,       // #FFE9E2
    ...SHADOWS.small,
  },
  chipBtnSurfaceText: {
    ...TYPO.caption,
    fontSize: 11,
    color: COLORS.textSecondary,
  },

  // === Payment button (subtle, link-style) ===
  paymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
  },
  paymentBtnText: {
    ...TYPO.caption,
    color: COLORS.primary,
    letterSpacing: 0.2,
  },

  // === Live Tracking button (prominent, filled orange) ===
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: SIZES.radiusMd,
    backgroundColor: COLORS.primary,
    ...SHADOWS.medium,
  },
  trackBtnText: {
    color: '#fff',
    ...TYPO.buttonSmall,
    flex: 1,
    textAlign: 'center',
  },

  // === Empty State ===
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: SIZES.marginMobile,
    gap: 12,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SIZES.xs,
    ...SHADOWS.small,
  },
  emptyTitle: {
    ...TYPO.h4,
    color: COLORS.textPrimary,
  },
  emptyText: {
    ...TYPO.bodySmall,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SIZES.xs,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    borderRadius: SIZES.radiusFull,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: 'transparent',
  },
  emptyCtaText: {
    ...TYPO.caption,
    color: COLORS.primary,
  },
});
