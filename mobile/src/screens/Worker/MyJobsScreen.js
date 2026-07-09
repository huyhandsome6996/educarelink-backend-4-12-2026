import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl, Animated, Alert, Platform, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMyJobsAsWorker } from '../../api/tasks';
import { checkConsent, grantConsent, triggerSOS, getSOSAlerts, resolveSOS } from '../../api/tracking';
import { startTracking, stopTracking, isTracking as isLocationTracking, getCurrentTaskId } from '../../services/LocationService';
import NotificationBell from '../../components/NotificationBell';
import TrackingConsentModal from '../../components/TrackingConsentModal';
import ActiveTrackingBanner from '../../components/ActiveTrackingBanner';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

const TABS = [
  { key: 'pending',  label: 'Chờ duyệt', icon: 'time-outline' },
  { key: 'accepted', label: 'Sắp làm', icon: 'checkmark-circle-outline' },
  { key: 'rejected', label: 'Lịch sử', icon: 'archive-outline' },
];

const STATUS_STYLE = {
  pending:  { color: COLORS.warning, bg: COLORS.warningBg, label: 'Chờ duyệt', icon: 'time' },
  accepted: { color: COLORS.primary, bg: COLORS.primaryLight, label: 'Đã nhận', icon: 'checkmark-circle' },
  rejected: { color: COLORS.textMuted, bg: '#f3f4f6', label: 'Bị từ chối', icon: 'close-circle' },
};

export default function MyJobsScreen() {
  const [applications, setApplications] = useState([]);
  const [activeTab, setActiveTab] = useState('accepted');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const bounceAnim = useRef(new Animated.Value(0)).current;

  // Tracking state
  const [consentModalVisible, setConsentModalVisible] = useState(false);
  const [consentTask, setConsentTask] = useState(null);
  const [consentMap, setConsentMap] = useState({}); // {task_id: 'granted'|'denied'|'revoked'|null}
  const [trackingTaskId, setTrackingTaskId] = useState(null);

  // SOS state — đồng bộ với web (parent có SOS, worker cũng cần)
  const [sosModal, setSosModal] = useState(null); // { taskId }
  const [sosMessage, setSosMessage] = useState('');
  const [sosAlertsMap, setSosAlertsMap] = useState({}); // {task_id: [alerts]}
  const [sosLoading, setSosLoading] = useState(false);

  const fetchJobs = async () => {
    try {
      const res = await getMyJobsAsWorker();
      setApplications(res.data);

      // Check consent cho các task được accept (task.status='in_progress')
      const acceptedApps = res.data.filter(a => a.status === 'accepted' && a.task);
      const consents = {};
      await Promise.all(acceptedApps.map(async (app) => {
        try {
          const r = await checkConsent(app.task);
          const c = r.data?.consent?.consent || (r.data?.has_consent ? null : 'pending');
          consents[app.task] = c;
        } catch (e) {
          consents[app.task] = null;
        }
      }));
      setConsentMap(consents);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchJobs(); }, []);

  // Empty state bounce animation
  useEffect(() => {
    if (!isLoading && applications.length === 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(bounceAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(bounceAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [isLoading, applications.length]);

  const bounceTransform = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  const filtered = applications.filter(a => {
    if (activeTab === 'rejected') return ['rejected', 'completed'].includes(a.status);
    return a.status === activeTab;
  });

  const totalEarned = applications
    .filter(a => a.status === 'accepted')
    .reduce((sum, a) => sum + parseFloat(a.task_price || 0), 0);

  const handleOpenConsent = (app) => {
    setConsentTask(app);
    setConsentModalVisible(true);
  };

  const handleConsentChoice = async (granted) => {
    setConsentModalVisible(false);
    if (!consentTask) return;
    const taskId = consentTask.task;
    setConsentMap(prev => ({ ...prev, [taskId]: granted ? 'granted' : 'denied' }));

    if (granted) {
      // Bắt đầu tracking
      const ok = await startTracking(taskId);
      if (ok) {
        setTrackingTaskId(taskId);
        Alert.alert('✅ Đã bật chia sẻ vị trí', 'Phụ huynh sẽ thấy vị trí của bạn khi đang làm việc.');
      } else {
        Alert.alert('⚠️ Không thể bật', 'Không có quyền truy cập vị trí. Vui lòng cấp quyền trong Settings.');
      }
    }
    setConsentTask(null);
  };

  const handleStopTracking = async () => {
    setTrackingTaskId(null);
    // Refresh consent map
    if (consentTask) {
      setConsentMap(prev => ({ ...prev, [consentTask.task]: 'revoked' }));
    } else {
      // Refresh all consents
      fetchJobs();
    }
  };

  // === SOS HANDLERS — đồng bộ với web (parent có SOS, worker cũng có) ===
  const fetchSOSAlerts = async (taskId) => {
    try {
      const r = await getSOSAlerts(taskId);
      setSosAlertsMap(prev => ({ ...prev, [taskId]: r.data || [] }));
    } catch (e) {
      console.error('fetchSOSAlerts error:', e);
    }
  };

  const handleTriggerSOS = async () => {
    if (!sosModal?.taskId) return;
    setSosLoading(true);
    try {
      // Lấy vị trí hiện tại nếu có (cần LocationService)
      let lat = null, lng = null;
      try {
        const LocationService = await import('../../services/LocationService');
        const loc = LocationService.getCurrentLocation?.();
        if (loc) { lat = loc.latitude; lng = loc.longitude; }
      } catch (e) { /* ignore */ }

      await triggerSOS({
        task_id: sosModal.taskId,
        latitude: lat,
        longitude: lng,
        message: sosMessage.trim(),
      });
      Alert.alert('🆘 Đã gửi SOS', 'Phụ huynh đã nhận được cảnh báo khẩn cấp.');
      setSosModal(null);
      setSosMessage('');
      fetchSOSAlerts(sosModal.taskId);
    } catch (e) {
      Alert.alert('Lỗi', e.response?.data?.error || 'Gửi SOS thất bại.');
    } finally {
      setSosLoading(false);
    }
  };

  const handleResolveSOS = async (sosId, taskId) => {
    try {
      await resolveSOS(sosId);
      Alert.alert('✅ Đã giải quyết', 'SOS đã được đánh dấu đã xử lý.');
      fetchSOSAlerts(taskId);
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể giải quyết SOS.');
    }
  };

  const renderItem = ({ item: app }) => {
    const st = STATUS_STYLE[app.status] || STATUS_STYLE.rejected;
    const consent = consentMap[app.task];
    const showTrackingUI = app.status === 'accepted';
    const isCurrentlyTracking = trackingTaskId === app.task;
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={[styles.statusIcon, { backgroundColor: st.bg }]}>
            <Ionicons name={st.icon} size={20} color={st.color} />
          </View>
          <View style={styles.cardContent}>
            <View style={styles.cardTop}>
              <View style={[styles.badge, { backgroundColor: st.bg }]}>
                <View style={[styles.badgeDot, { backgroundColor: st.color }]} />
                <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
              </View>
              <Text style={styles.price}>
                {parseInt(app.task_price || 0).toLocaleString('vi-VN')}đ
              </Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>{app.task_title}</Text>
            <View style={styles.meta}>
              <Ionicons name="time-outline" size={13} color={COLORS.textMuted} />
              <Text style={styles.metaText}>
                {app.task_scheduled_time ? new Date(app.task_scheduled_time).toLocaleString('vi-VN') : 'Chưa có'}
              </Text>
            </View>
            <View style={styles.meta}>
              <Ionicons name="location-outline" size={13} color={COLORS.textMuted} />
              <Text style={styles.metaText}>{app.task_location || 'Không có địa điểm'}</Text>
            </View>
          </View>
        </View>
        {/* Thông tin phụ huynh */}
        {app.parent_username && (
          <View style={styles.parentCard}>
            <View style={styles.parentAvatar}>
              <Text style={styles.parentAvatarText}>{app.parent_username?.[0]?.toUpperCase() || 'P'}</Text>
            </View>
            <View>
              <Text style={styles.parentLabel}>Phụ huynh</Text>
              <Text style={styles.parentName}>{app.parent_username}</Text>
            </View>
          </View>
        )}

        {/* === LIVE TRACKING UI === */}
        {showTrackingUI && (
          <>
            {isCurrentlyTracking ? (
              <ActiveTrackingBanner
                taskId={app.task}
                taskTitle={app.task_title}
                onStopped={() => {
                  setTrackingTaskId(null);
                  setConsentMap(prev => ({ ...prev, [app.task]: 'revoked' }));
                }}
              />
            ) : consent === 'granted' ? (
              <TouchableOpacity
                style={styles.trackingStartBtn}
                onPress={async () => {
                  const ok = await startTracking(app.task);
                  if (ok) {
                    setTrackingTaskId(app.task);
                  } else {
                    Alert.alert('⚠️ Không thể bật', 'Không có quyền truy cập vị trí.');
                  }
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="play-circle" size={16} color={COLORS.success} />
                <Text style={styles.trackingStartText}>Bắt đầu chia sẻ vị trí</Text>
              </TouchableOpacity>
            ) : consent === 'denied' || consent === 'revoked' ? (
              <TouchableOpacity
                style={styles.trackingStartBtn}
                onPress={() => handleOpenConsent(app)}
                activeOpacity={0.85}
              >
                <Ionicons name="location-outline" size={16} color={COLORS.primary} />
                <Text style={styles.trackingStartText}>Đồng ý chia sẻ vị trí</Text>
              </TouchableOpacity>
            ) : consent === null || consent === undefined ? (
              <TouchableOpacity
                style={styles.trackingStartBtn}
                onPress={() => handleOpenConsent(app)}
                activeOpacity={0.85}
              >
                <Ionicons name="location-outline" size={16} color={COLORS.primary} />
                <Text style={styles.trackingStartText}>Cho phép theo dõi vị trí</Text>
              </TouchableOpacity>
            ) : null}

            {/* === SOS BUTTON — worker có thể gặp tình huống khẩn cấp === */}
            <View style={styles.sosRow}>
              <TouchableOpacity
                style={styles.sosBtn}
                onPress={() => {
                  setSosModal({ taskId: app.task, taskTitle: app.task_title });
                  fetchSOSAlerts(app.task);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="warning" size={16} color="#fff" />
                <Text style={styles.sosBtnText}>SOS khẩn cấp</Text>
              </TouchableOpacity>
              {sosAlertsMap[app.task]?.filter(a => a.status === 'active').length > 0 && (
                <View style={styles.sosActiveBadge}>
                  <Ionicons name="alert-circle" size={11} color={COLORS.error} />
                  <Text style={styles.sosActiveText}>
                    {sosAlertsMap[app.task].filter(a => a.status === 'active').length} SOS active
                  </Text>
                </View>
              )}
            </View>

            {/* List SOS alerts của task (nếu có) */}
            {sosAlertsMap[app.task]?.length > 0 && (
              <View style={styles.sosAlertsBox}>
                <Text style={styles.sosAlertsLabel}>🚨 SOS alerts gần đây:</Text>
                {sosAlertsMap[app.task].slice(0, 3).map(alert => (
                  <View key={alert.id} style={styles.sosAlertItem}>
                    <View style={[styles.sosAlertDot, { backgroundColor: alert.status === 'active' ? COLORS.error : COLORS.success }]} />
                    <Text style={styles.sosAlertText}>
                      {alert.sender === 'worker' ? 'Bạn' : 'Phụ huynh'} • {alert.message || '(không có tin nhắn)'}
                    </Text>
                    {alert.status === 'active' && (
                      <TouchableOpacity onPress={() => handleResolveSOS(alert.id, app.task)}>
                        <Text style={styles.sosResolveBtn}>Giải quyết</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Việc của tôi</Text>
        <View style={styles.headerRight}>
          <NotificationBell dark />
          {totalEarned > 0 && (
            <View style={styles.earningsBadge}>
              <Ionicons name="wallet-outline" size={14} color={COLORS.success} />
              <Text style={styles.earningsText}>{totalEarned.toLocaleString('vi-VN')}đ</Text>
            </View>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.8}
            >
              <Ionicons name={tab.icon} size={16} color={isActive ? COLORS.primary : COLORS.textMuted} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList data={filtered} keyExtractor={i => i.id.toString()} renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchJobs(); }} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Animated.View style={[styles.emptyIconCircle, { transform: [{ translateY: bounceTransform }] }]}>
                <Ionicons name="document-outline" size={36} color={COLORS.primary} />
              </Animated.View>
              <Text style={styles.emptyTitle}>Không có việc nào</Text>
              <Text style={styles.emptyText}>Hãy ứng tuyển công việc từ bảng tin!</Text>
            </View>
          }
        />
      )}

      {/* Tracking Consent Modal */}
      <TrackingConsentModal
        visible={consentModalVisible}
        taskId={consentTask?.task}
        parentName={consentTask?.parent_username}
        taskTitle={consentTask?.task_title}
        onConsent={handleConsentChoice}
        onClose={() => setConsentModalVisible(false)}
      />

      {/* SOS Modal — worker gửi SOS khẩn cấp */}
      <Modal visible={!!sosModal} transparent animationType="fade" onRequestClose={() => setSosModal(null)}>
        <View style={styles.sosOverlay}>
          <View style={styles.sosModalContent}>
            <View style={styles.sosModalHeader}>
              <Ionicons name="warning" size={28} color={COLORS.error} />
              <Text style={styles.sosModalTitle}>SOS Khẩn cấp</Text>
            </View>
            <Text style={styles.sosModalHint}>
              Gửi SOS cho phụ huynh về tình huống khẩn cấp. Vị trí hiện tại của bạn sẽ được gửi kèm (nếu đang bật tracking).
            </Text>
            {sosModal?.taskTitle && (
              <Text style={styles.sosModalTask}>📋 {sosModal.taskTitle}</Text>
            )}

            <Text style={styles.sosInputLabel}>Tin nhắn (tuỳ chọn):</Text>
            <TextInput
              style={styles.sosInput}
              value={sosMessage}
              onChangeText={setSosMessage}
              placeholder="VD: Gặp sự cố an toàn, cần phụ huynh liên hệ ngay..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />

            <View style={styles.sosModalActions}>
              <TouchableOpacity style={styles.sosCancelBtn} onPress={() => setSosModal(null)}>
                <Text style={styles.sosCancelText}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sosSendBtn, sosLoading && { opacity: 0.6 }]}
                onPress={handleTriggerSOS}
                disabled={sosLoading}
              >
                {sosLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="send" size={14} color="#fff" />
                    <Text style={styles.sosSendText}>Gửi SOS</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, backgroundColor: COLORS.surface,
  },
  headerTitle: { ...TYPO.h1, fontSize: 24, color: COLORS.textPrimary },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm },
  earningsBadge: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    backgroundColor: COLORS.successBg, borderRadius: SIZES.radiusXl,
    paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: '#bbf7d0',
    ...SHADOWS.small,
  },
  earningsText: { ...TYPO.buttonSmall, color: COLORS.success },
  tabs: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    gap: SIZES.xs,
  },
  tab: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderRadius: SIZES.radiusSm,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.background,
  },
  tabActive: {
    backgroundColor: COLORS.primaryLight,
    ...SHADOWS.small,
  },
  tabText: { ...TYPO.buttonSmall, color: COLORS.textMuted, fontWeight: '600' },
  tabTextActive: { color: COLORS.primary, fontWeight: '800' },
  list: { padding: SIZES.md, gap: 12 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    padding: 14, gap: 10,
    ...SHADOWS.cardHover,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary,
  },
  cardRow: { flexDirection: 'row', gap: 12 },
  statusIcon: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.small,
  },
  cardContent: { flex: 1, gap: 5 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: {
    borderRadius: SIZES.radiusXs, paddingHorizontal: 8, paddingVertical: 3,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { ...TYPO.overline },
  price: { ...TYPO.h4, fontWeight: '900', color: COLORS.primary },
  title: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  meta: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  metaText: { ...TYPO.bodySmall, color: COLORS.textSecondary, flex: 1 },
  parentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusSm,
    padding: 10,
    ...SHADOWS.small,
    borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  parentAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.small,
  },
  parentAvatarText: { color: '#fff', ...TYPO.buttonSmall },
  parentLabel: { ...TYPO.overline, color: COLORS.textMuted, fontWeight: '600' },
  parentName: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.small,
  },
  emptyTitle: { ...TYPO.h4, color: COLORS.textPrimary },
  emptyText: { ...TYPO.bodySmall, color: COLORS.textMuted },
  trackingStartBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.primaryLight, borderWidth: 1, borderColor: COLORS.primarySoft,
    marginTop: 8,
  },
  trackingStartText: { ...TYPO.buttonSmall, color: COLORS.primary, fontWeight: '700' },
  // SOS UI
  sosRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  sosBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.error, borderRadius: SIZES.radiusSm, paddingVertical: 10,
    ...SHADOWS.small,
  },
  sosBtnText: { color: '#fff', ...TYPO.buttonSmall, fontWeight: '800' },
  sosActiveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.errorBg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: '#fecaca',
  },
  sosActiveText: { ...TYPO.overline, color: COLORS.error, fontWeight: '800', fontSize: 9 },
  sosAlertsBox: {
    backgroundColor: COLORS.errorBg, borderRadius: SIZES.radiusSm, padding: 10, marginTop: 8, gap: 6,
    borderWidth: 1, borderColor: '#fecaca',
  },
  sosAlertsLabel: { ...TYPO.overline, color: COLORS.error, fontWeight: '700' },
  sosAlertItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  sosAlertDot: { width: 8, height: 8, borderRadius: 4 },
  sosAlertText: { flex: 1, ...TYPO.bodySmall, color: COLORS.textPrimary },
  sosResolveBtn: { ...TYPO.buttonSmall, color: COLORS.primary, fontWeight: '700' },
  // SOS Modal
  sosOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  sosModalContent: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusLg, padding: 20, ...SHADOWS.large,
  },
  sosModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  sosModalTitle: { ...TYPO.h4, color: COLORS.error, fontWeight: '800' },
  sosModalHint: { ...TYPO.bodySmall, color: COLORS.textSecondary, marginBottom: 12 },
  sosModalTask: {
    ...TYPO.bodySmall, color: COLORS.textPrimary, fontWeight: '700',
    backgroundColor: COLORS.background, padding: 8, borderRadius: SIZES.radiusSm, marginBottom: 12,
  },
  sosInputLabel: { ...TYPO.buttonSmall, color: COLORS.textSecondary, marginBottom: 4 },
  sosInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radiusSm,
    paddingHorizontal: 12, paddingVertical: 10, ...TYPO.body, color: COLORS.textPrimary,
    minHeight: 80, textAlignVertical: 'top',
  },
  sosModalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 16 },
  sosCancelBtn: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.background,
  },
  sosCancelText: { ...TYPO.button, color: COLORS.textSecondary },
  sosSendBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.error, ...SHADOWS.small,
  },
  sosSendText: { ...TYPO.button, color: '#fff', fontWeight: '800' },
});
