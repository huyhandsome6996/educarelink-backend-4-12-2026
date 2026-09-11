import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl, Animated, Alert, Platform, Modal, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getMyJobsAsWorker } from '../../api/tasks';
import { getBookings } from '../../api/matching';
import { checkConsent, grantConsent, triggerSOS, getSOSAlerts, resolveSOS } from '../../api/tracking';
import { startTracking, stopTracking, isTracking as isLocationTracking, getCurrentTaskId, hasPendingResumeTask } from '../../services/LocationService';
import NotificationBell from '../../components/NotificationBell';
import TrackingConsentModal from '../../components/TrackingConsentModal';
import ActiveTrackingBanner from '../../components/ActiveTrackingBanner';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

const TABS = [
  { key: 'accepted', label: 'Sắp làm', icon: 'calendar-outline' },
  { key: 'history',  label: 'Lịch sử', icon: 'time-outline' },
];

const STATUS_STYLE = {
  accepted:    { color: COLORS.primary, bg: COLORS.primaryLight, label: 'Sắp làm', icon: 'calendar' },
  committed:   { color: COLORS.primary, bg: COLORS.primaryLight, label: 'Đã cam kết', icon: 'checkmark-circle' },
  in_progress: { color: '#0284C7', bg: '#e0f2fe', label: 'Đang làm', icon: 'play-circle' },
  completed:   { color: COLORS.success, bg: '#ecfdf5', label: 'Hoàn thành', icon: 'checkmark-done-circle' },
  history:     { color: COLORS.textMuted, bg: '#f3f4f6', label: 'Hoàn thành', icon: 'checkmark-done-circle' },
  rejected:    { color: COLORS.textMuted, bg: '#f3f4f6', label: 'Đã hủy', icon: 'close-circle' },
};

export default function MyJobsScreen() {
  const navigation = useNavigation();
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
      const combined = [];

      // 1. Lấy đơn từ hệ thống ghép cặp Flow 1 (Booking)
      try {
        const bRes = await getBookings({ role: 'carepartner' });
        const bookingsList = bRes.data?.results ?? bRes.data ?? [];
        bookingsList.forEach(b => {
          // Bỏ qua awaiting_commitment (đơn chưa xác nhận nằm ở Trang chủ)
          if (b.status === 'awaiting_commitment') return;

          const isUpcoming = ['committed', 'in_progress', 'suspected_no_show'].includes(b.status);

          combined.push({
            id: `booking_${b.id}`,
            isBooking: true,
            bookingId: b.id,
            task: b.job,
            task_title: b.job_title || 'Công việc ghép cặp',
            task_price: b.total_value_vnd || 0,
            task_scheduled_time: b.first_slot ? `${b.first_slot.date} · ${b.first_slot.time_from?.slice(0, 5)} - ${b.first_slot.time_to?.slice(0, 5)}` : null,
            task_location: b.job_address || 'Địa điểm theo thỏa thuận',
            parent_username: b.parent_name || 'Phụ huynh',
            status: isUpcoming ? 'accepted' : 'history',
            task_status: b.status === 'completed' ? 'completed' : b.status === 'in_progress' ? 'in_progress' : 'open',
            raw_status: b.status,
            status_label: b.status_label_vi || (isUpcoming ? 'Đã cam kết' : 'Hoàn thành'),
            first_slot: b.first_slot,
            compensation_vnd: b.compensation_vnd,
          });
        });
      } catch (e) {
        console.warn('Lỗi tải bookings:', e);
      }

      // 2. Lấy đơn từ hệ thống TaskApplication (nếu có)
      try {
        const res = await getMyJobsAsWorker();
        const appsList = res.data ?? [];
        appsList.forEach(a => {
          // Bỏ qua pending vì theo yêu cầu người dùng "Bỏ cái chờ duyệt đi"
          if (a.status === 'pending') return;
          const isHistory = a.task_status === 'completed' || a.status === 'rejected';
          combined.push({
            ...a,
            isBooking: false,
            status: isHistory ? 'history' : 'accepted',
            status_label: a.task_status === 'completed' ? 'Hoàn thành' : 'Sắp làm',
          });
        });
      } catch (e) {
        console.warn('Lỗi tải applications:', e);
      }

      setApplications(combined);

      // ⚡ Auto-stop tracking nếu task đã completed/cancelled
      const trackingTaskId = getCurrentTaskId();
      if (trackingTaskId) {
        const trackingApp = combined.find(a => a.task === trackingTaskId);
        if (trackingApp) {
          const taskStatus = trackingApp.task_status;
          if (taskStatus && taskStatus !== 'in_progress') {
            console.log(`[MyJobs] Task #${trackingTaskId} status=${taskStatus} → auto stop tracking`);
            await stopTracking();
            setTrackingTaskId(null);
            Alert.alert(
              'ⓘ Theo dõi vị trí đã dừng',
              `Công việc "${trackingApp.task_title}" đã ${taskStatus === 'completed' ? 'hoàn thành' : 'bị hủy'}. Theo dõi vị trí đã tự động dừng.`,
              [{ text: 'OK' }]
            );
          }
        }
      }

      // Check consent cho các task được accept (task.status='in_progress')
      const acceptedApps = combined.filter(a => a.status === 'accepted' && a.task && !a.isBooking);
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
    if (activeTab === 'history') {
      return a.status === 'history' || a.task_status === 'completed' || a.status === 'rejected';
    }
    return a.status === 'accepted' && a.task_status !== 'completed';
  });

  const totalEarned = applications
    .filter(a => a.status === 'history' && (a.task_status === 'completed' || a.raw_status === 'completed'))
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
    const st = STATUS_STYLE[app.raw_status] || STATUS_STYLE[app.status] || STATUS_STYLE.rejected;
    const consent = consentMap[app.task];
    const showTrackingUI = app.status === 'accepted';
    const isCurrentlyTracking = trackingTaskId === app.task;
    const formattedTime = app.task_scheduled_time
      ? (String(app.task_scheduled_time).includes('·')
          ? app.task_scheduled_time
          : new Date(app.task_scheduled_time).toLocaleString('vi-VN'))
      : 'Chưa có';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => {
          if (app.isBooking) {
            navigation.navigate('BookingDetail', { bookingId: app.bookingId });
          } else if (app.task) {
            navigation.navigate('TaskDetail', { taskId: app.task });
          }
        }}
      >
        <View style={styles.cardRow}>
          <View style={[styles.statusIcon, { backgroundColor: st.bg }]}>
            <Ionicons name={st.icon} size={20} color={st.color} />
          </View>
          <View style={styles.cardContent}>
            <View style={styles.cardTop}>
              <View style={[styles.badge, { backgroundColor: st.bg }]}>
                <View style={[styles.badgeDot, { backgroundColor: st.color }]} />
                <Text style={[styles.badgeText, { color: st.color }]}>{app.status_label || st.label}</Text>
              </View>
              <Text style={styles.price}>
                {parseInt(app.task_price || 0).toLocaleString('vi-VN')}đ
              </Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>{app.task_title}</Text>
            <View style={styles.meta}>
              <Ionicons name="time-outline" size={13} color={COLORS.textMuted} />
              <Text style={styles.metaText}>{formattedTime}</Text>
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

        {/* Nút xem chi tiết cho đơn Flow 1 Matching Booking */}
        {app.isBooking && (
          <View style={styles.bookingActionRow}>
            <TouchableOpacity
              style={styles.detailBtn}
              onPress={() => navigation.navigate('BookingDetail', { bookingId: app.bookingId })}
              activeOpacity={0.85}
            >
              <Ionicons name="document-text-outline" size={15} color={COLORS.primary} />
              <Text style={styles.detailBtnText}>
                {app.status === 'accepted' ? 'Chi tiết ca & Thao tác' : 'Xem chi tiết ca làm'}
              </Text>
            </TouchableOpacity>

            {['cancelled_by_carepartner', 'no_show', 'no_show_unconfirmed', 'suspected_no_show'].includes(app.raw_status) && (
              <TouchableOpacity
                style={styles.appealBtn}
                onPress={() => navigation.navigate('Appeal', { bookingId: app.bookingId })}
                activeOpacity={0.85}
              >
                <Ionicons name="megaphone-outline" size={14} color="#B45309" />
                <Text style={styles.appealBtnText}>Kháng cáo ELO</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* === B1 — NÚT GHI NHẬT KÝ CHO TASK HOÀN THÀNH (history tab) === */}
        {(app.status === 'history' || app.task_status === 'completed') && !app.isBooking && (
          <>
            <TouchableOpacity
              style={styles.diaryBtn}
              onPress={() => navigation.navigate('CareDiaryForm', { taskId: app.task, taskTitle: app.task_title })}
              activeOpacity={0.85}
            >
              <Ionicons name="book-outline" size={16} color={COLORS.primary} />
              <Text style={styles.diaryBtnText}>Ghi nhật ký chăm sóc</Text>
            </TouchableOpacity>

            {/* === N — CHAT (24h) CHO TASK HOÀN THÀNH — parity với web worker_jobs === */}
            <TouchableOpacity
              style={styles.chatBtn}
              onPress={() => navigation.navigate('Chat', { taskId: app.task, taskTitle: app.task_title })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Xem chat với phụ huynh (còn 24 giờ sau khi hoàn thành)"
            >
              <Ionicons name="chatbubble-outline" size={16} color="#fff" />
              <Text style={styles.chatBtnText}>Chat với phụ huynh (24h)</Text>
            </TouchableOpacity>
          </>
        )}

        {/* === LIVE TRACKING UI === */}
        {showTrackingUI && app.task_status !== 'completed' && (
          <>
            {/* === B1 — NÚT GHI NHẬT KÝ CHĂM SÓC === */}
            <TouchableOpacity
              style={styles.diaryBtn}
              onPress={() => navigation.navigate('CareDiaryForm', { taskId: app.task, taskTitle: app.task_title })}
              activeOpacity={0.85}
            >
              <Ionicons name="book-outline" size={16} color={COLORS.primary} />
              <Text style={styles.diaryBtnText}>Ghi nhật ký chăm sóc</Text>
            </TouchableOpacity>

            {/* === N — NHẮN TIN VỚI PHỤ HUYNH (cửa sổ còn hiệu lực) === */}
            <TouchableOpacity
              style={styles.chatBtn}
              onPress={() => navigation.navigate('Chat', { taskId: app.task, taskTitle: app.task_title })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Nhắn tin với phụ huynh"
            >
              <Ionicons name="chatbubble-outline" size={16} color="#fff" />
              <Text style={styles.chatBtnText}>Nhắn tin với phụ huynh</Text>
            </TouchableOpacity>

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
      </TouchableOpacity>
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
                <Ionicons name="briefcase-outline" size={36} color={COLORS.primary} />
              </Animated.View>
              <Text style={styles.emptyTitle}>
                {activeTab === 'accepted' ? 'Chưa có ca làm sắp tới' : 'Chưa có lịch sử công việc'}
              </Text>
              <Text style={styles.emptyText}>
                {activeTab === 'accepted'
                  ? 'Khi bạn bấm Xác nhận các đơn được giao ở Trang chủ, ca làm sẽ xuất hiện tại đây.'
                  : 'Các ca làm sau khi hoàn thành sẽ được lưu trữ tại đây.'}
              </Text>
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
  // B1 — Care Diary
  diaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.primaryLight, borderWidth: 1, borderColor: COLORS.primarySoft,
    marginTop: 8,
  },
  diaryBtnText: { ...TYPO.buttonSmall, color: COLORS.primary, fontWeight: '700' },
  // N — nút chat với phụ huynh
  chatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: SIZES.radiusSm,
    backgroundColor: '#3B82F6',
    marginTop: 8,
  },
  chatBtnText: { ...TYPO.buttonSmall, color: '#fff', fontWeight: '700' },
  // Flow 1 Booking actions
  bookingActionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  detailBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.primaryLight, borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  detailBtnText: { ...TYPO.buttonSmall, color: COLORS.primary, fontWeight: '700' },
  appealBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: SIZES.radiusSm,
    backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A',
  },
  appealBtnText: { ...TYPO.caption, color: '#B45309', fontWeight: '700' },
});

