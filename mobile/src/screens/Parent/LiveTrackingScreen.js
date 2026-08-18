import React, {useState, useEffect, useRef, useCallback} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator, Alert, Platform, Linking, ScrollView, RefreshControl, Animated, Vibration, AppState} from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import {
  getLiveLocation, getLocationHistory, triggerSOS, revokeConsent,
  getDeviceStatus, getOfflineAlerts, acknowledgeOfflineAlert,
} from '../../api/tracking';
import {
  playEmergencyAlarm, stopEmergencyAlarm, unloadEmergencyAlarm,
} from '../../services/EmergencyAlarmService';
import {COLORS, SHADOWS, SIZES, TYPO, ANIM} from '../../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const POLL_INTERVAL_MS = 5000; // Parent poll location mỗi 5s
const DEVICE_STATUS_POLL_MS = 10000; // Parent poll device status mỗi 10s
const GEOFENCE_RADIUS = 500; // mét

// ====================================================================
// Fix C8: KHÔNG gọi setNotificationHandler ở đây nữa.
// Handler global duy nhất được set trong utils/notifications.js (import
// sớm ở App.js). Priority cho alert khẩn cấp được xử lý trong listener
// callback (Notifications.addNotificationReceivedListener) bên dưới +
// qua priority của scheduleNotificationAsync.
// Trước đây file này cũng gọi setNotificationHandler → override handler
// global → behavior không predict được tùy screen đang mount.
// ====================================================================

export default function LiveTrackingScreen() {
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
  const route = useRoute();
  const { taskId, taskTitle, taskLatitude, taskLongitude, workerPhone } = route.params || {};
  // Fix H14: lưu workerPhone truyền qua navigation param để gọi điện.
  // Trước đây các nút "Gọi Carepartner" gọi Linking.openURL('tel:')
  // không có số → không gọi được ai (có thể crash trên Android).

  const [liveData, setLiveData] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sosLoading, setSosLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [offlineAlertActive, setOfflineAlertActive] = useState(false);
  // QA-FIX-2 / B3: track trạng thái offline/stale từ API để hiển thị rõ
  // "vị trí cuối cùng lúc X" thay vì giả như vị trí live khi carepartner mất mạng.
  const [isLocationStale, setIsLocationStale] = useState(false);
  const [isLocationOffline, setIsLocationOffline] = useState(false);
  const [offlineThresholdSeconds, setOfflineThresholdSeconds] = useState(null);
  const pollRef = useRef(null);
  const deviceStatusPollRef = useRef(null);
  const lastAlertIdRef = useRef(null);

  // Poll live location
  // QA-FIX-2 / B3: parse thêm is_stale/is_offline/last_seen từ response
  // để UI hiển thị rõ vị trí cuối vs vị trí live.
  const fetchLive = useCallback(async () => {
    if (!taskId) return;
    try {
      const res = await getLiveLocation(taskId);
      setLiveData(res.data);
      setLastUpdate(new Date());
      setError(null);
      // QA-FIX-2 / B3: cập nhật stale/offline status từ API response
      setIsLocationStale(res.data?.is_stale || false);
      setIsLocationOffline(res.data?.is_offline || false);
      if (res.data?.offline_threshold_seconds) {
        setOfflineThresholdSeconds(res.data.offline_threshold_seconds);
      }
    } catch (e) {
      console.warn('fetchLive error:', e?.response?.status);
      if (e?.response?.status === 403) {
        setError('Bạn không có quyền xem vị trí task này.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  // Poll device status (online/offline + alert)
  const fetchDeviceStatus = useCallback(async () => {
    if (!taskId) return;
    try {
      const res = await getDeviceStatus(taskId);
      const status = res.data;
      setDeviceStatus(status);

      // Detect offline alert mới → chuông kêu
      const activeAlert = status.active_alerts?.[0];
      if (activeAlert && activeAlert.id !== lastAlertIdRef.current) {
        lastAlertIdRef.current = activeAlert.id;
        setOfflineAlertActive(true);
        // Phan 2: truyền alertId để khi user bấm "Đã biết" có thể gọi
        // API acknowledge → backend dừng retry push.
        // BUG FIX: DeviceOfflineAlert LUÔN LUÔN là cảnh báo khẩn cấp
        // (isCritical=true). Trước đây chỉ truyền alertId, thiếu isCritical
        // → isCritical nhận undefined (falsy) → playEmergencyAlarm() không
        // bao giờ chạy qua đường polling → còi to không kêu khi push bị miss.
        // Mọi lời gọi triggerAlarmSound cho DeviceOfflineAlert phải truyền
        // isCritical=true — đây là invariant của hệ thống an toàn.
        triggerAlarmSound(activeAlert.id, /* isCritical= */ true);
      } else if (!activeAlert) {
        setOfflineAlertActive(false);
      }
    } catch (e) {
      console.warn('fetchDeviceStatus error:', e?.response?.status);
    }
  }, [taskId]);

  useEffect(() => {
    fetchLive();
    fetchDeviceStatus();
    pollRef.current = setInterval(fetchLive, POLL_INTERVAL_MS);
    deviceStatusPollRef.current = setInterval(fetchDeviceStatus, DEVICE_STATUS_POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (deviceStatusPollRef.current) clearInterval(deviceStatusPollRef.current);
      // QA-FIX-1 / Spec 2.6: stop + unload alarm khi unmount screen
      // (tránh audio loop tiếp tục chạy khi parent đã rời screen).
      stopEmergencyAlarm();
      unloadEmergencyAlarm();
    };
    // Fix H11: thêm taskId trực tiếp vào deps để khi taskId đổi (vd: từ
    // navigation param), fetchLive/fetchDeviceStatus được re-bind và poll
    // lại data của task mới. Trước đây deps chỉ có callback refs → stale
    // callback khi taskId undefined lúc mount.
  }, [fetchLive, fetchDeviceStatus, taskId]);

  // Trigger alarm sound + vibration khi có offline alert
  // Phan 2: nhận type 'device_offline' + flag data.critical=True (channel
  // emergency-alerts, còi to + retry liên tục tới khi acknowledge). Khi user
  // bấm "Đã biết" → gọi API acknowledge để backend dừng retry push.
  //
  // QA-FIX-1 / Spec 2.6: dùng EmergencyAlarmService cho audio alarm loop
  // (trước đây chỉ Vibration + local notification — không có audio thực sự).
  //
  // QA-FIX-7 / N1: payload đã được đảo lại — data.type luôn là 'device_offline'
  // (giá trị CŨ, để app cũ tiếp tục match), flag data.critical=True thay thế
  // cho 'device_offline_critical' cũ. App mới check data.critical để quyết
  // định dùng EmergencyAlarmService (còi to) hay chỉ Vibration (fallback).
  const triggerAlarmSound = async (alertIdFromData, isCritical) => {
    try {
      // QA-FIX-7 / N1: nếu data.critical=True → dùng EmergencyAlarmService
      // (còi to loop + Vibration pattern dài). Nếu critical=false/missing
      // (backend cũ hơn hoặc flag không có) → chỉ Vibration (fallback basic).
      if (isCritical) {
        // QA-FIX-1 / Spec 2.6: phát audio alarm loop liên tục qua EmergencyAlarmService
        // (expo-av + Vibration fallback). Alarm sẽ loop cho tới khi parent acknowledge
        // hoặc unmount screen.
        await playEmergencyAlarm();
      }

      // Vibration pattern khẩn cấp: 1s rung, 0.5s nghỉ, lặp 5 lần (cũ — giữ làm
      // burst ban đầu để thu hút chú ý ngay lập tức, sau đó EmergencyAlarmService
      // sẽ tiếp tục loop Vibration pattern dài nếu critical=True).
      Vibration.vibrate([1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000], false);

      // Schedule local notification với sound default (đảm bảo available)
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🚨🚨🚨 CẢNH BÁO KHẨN CẤP",
          body: "Thiết bị Carepartner đã ngừng gửi tín hiệu! Vui lòng kiểm tra ngay.",
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: {
            // QA-FIX-7 / N1: type='device_offline' (giống backend) + critical flag
            type: 'device_offline',
            critical: isCritical,
            task_id: taskId,
            alert_id: alertIdFromData,
            priority: 'high',
          },
        },
        trigger: null, // ngay lập tức
      });
    } catch (e) {
      console.warn('triggerAlarmSound failed:', e);
    }
  };

  // Phan 2 — gọi API acknowledge để dừng retry push ở backend
  // QA-FIX-1 / Spec 2.6: cũng stop alarm audio khi parent acknowledge
  // (trước đây audio loop không có cách dừng trừ unmount screen).
  const handleAcknowledgeAlert = async (alertId) => {
    if (!alertId || !taskId) return;
    try {
      // QA-FIX-1 / Spec 2.6: stop alarm NGAY khi parent bấm "Đã biết"
      // (trước khi gọi API — giảm độ trễ cảm giác).
      await stopEmergencyAlarm();
      await acknowledgeOfflineAlert(taskId, alertId);
      setOfflineAlertActive(false);
      console.log(`[LiveTracking] Acknowledged alert #${alertId} — backend sẽ dừng retry push + alarm stopped`);
    } catch (e) {
      console.warn(`[LiveTracking] Acknowledge alert #${alertId} failed:`, e?.response?.status || e.message);
    }
  };

  // Listen notification khi app đang mở
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data || {};
      const body = notification.request.content.body || '';

      // === DEVICE OFFLINE alert ===
      // QA-FIX-7 / N1: payload giờ luôn có data.type='device_offline' (giá trị
      // CŨ, để app cũ tiếp tục match). App mới đọc thêm data.critical để quyết
      // định hành vi:
      //   - data.critical === true → bản nâng cấp (còi to EmergencyAlarmService,
      //     channel emergency-alerts, retry push liên tục).
      //   - data.critical falsy (false/undefined) → fallback basic (chỉ
      //     Vibration, channel critical_alerts) — tương thích backend cũ hơn
      //     nữa nếu có.
      //
      // Điều kiện if ĐƠN GIẢN: `data.type === 'device_offline'` — y hệt app cũ
      // trên nhánh main. App cũ không biết field `critical` nên ignore, vẫn
      // báo động được (channel critical_alerts do backend send_expo_push_notification
      // resolve type='device_offline' không có critical → dùng config cũ).
      if (data.type === 'device_offline') {
        const alertId = data.alert_id;
        const isCritical = data.critical === true;
        // QA-FIX-1 / Spec 2.6 + QA-FIX-7 / N1: nếu critical=True → phát audio
        // alarm loop qua EmergencyAlarmService (còi to). Nếu không → chỉ
        // Vibration (fallback basic, tương thích backend cũ).
        if (isCritical) {
          playEmergencyAlarm();
        }
        // Vibration pattern khẩn cấp (burst ban đầu)
        Vibration.vibrate([1000, 500, 1000, 500, 1000, 500, 1000], false);
        Alert.alert(
          "🚨🚨🚨 CẢNH BÁO KHẨN CẤP",
          body || 'Thiết bị Carepartner mất kết nối!',
          [
            // Phan 2: bấm "Đã biết" → acknowledge → backend dừng retry push
            // + QA-FIX-1 / Spec 2.6: stop alarm audio
            {
              text: 'Đã biết',
              style: 'destructive',
              onPress: () => handleAcknowledgeAlert(alertId),
            },
            { text: 'Gọi 113', onPress: () => Linking.openURL('tel:113') },
            // Fix H14: chỉ mở dialer khi có số carepartner
            ...(workerPhone ? [{ text: 'Gọi Carepartner', onPress: () => Linking.openURL(`tel:${workerPhone}`) }] : []),
          ]
        );
      }
      // === GEOFENCE WARNING (AI predictive — sắp rời vùng) ===
      else if (data.type === 'geofence_warning') {
        Vibration.vibrate([300, 200, 300, 200, 300], false);
        Alert.alert(
          "⚠️ AI Cảnh báo: Sắp rời vùng an toàn!",
          body || 'Carepartner đang di chuyển gần ranh giới vùng an toàn. Vui lòng để ý!',
          [
            { text: 'Đã biết', style: 'default' },
            ...(workerPhone ? [{ text: 'Gọi Carepartner', onPress: () => Linking.openURL(`tel:${workerPhone}`) }] : []),
          ]
        );
      }
      // === GEOFENCE EXIT alert — carepartner rời vùng an toàn ===
      else if (data.type === 'geofence_exit') {
        // Vibration pattern cảnh báo
        Vibration.vibrate([500, 250, 500, 250, 500, 250, 500], false);
        Alert.alert(
          "🚨🚨🚨 CẢNH BÁO: Carepartner rời vùng an toàn!",
          body || 'Carepartner đã rời khỏi vùng an toàn. Vui lòng kiểm tra ngay!',
          [
            { text: 'Đã biết', style: 'default' },
            ...(workerPhone ? [{ text: 'Gọi Carepartner', onPress: () => Linking.openURL(`tel:${workerPhone}`) }] : []),
            { text: 'Gọi 113', onPress: () => Linking.openURL('tel:113') },
          ]
        );
      }
      // === SOS alert ===
      else if (data.type === 'sos_alert') {
        Vibration.vibrate([800, 400, 800, 400, 800], false);
        Alert.alert(
          "🆘 SOS KHẨN CẤP",
          body || 'Carepartner vừa gửi SOS khẩn cấp!',
          [
            { text: 'Đã biết', style: 'default' },
            ...(workerPhone ? [{ text: 'Gọi Carepartner', onPress: () => Linking.openURL(`tel:${workerPhone}`) }] : []),
            { text: 'Gọi 113', onPress: () => Linking.openURL('tel:113') },
          ]
        );
      }
      // === GEOFENCE RE-ENTER (carepartner quay lại vùng) ===
      else if (data.type === 'geofence_enter') {
        // Vibration nhẹ báo yên tâm
        Vibration.vibrate([200, 100, 200], false);
        Alert.alert(
          "✅ Carepartner đã quay lại vùng an toàn",
          body || 'Carepartner đã quay lại trong vùng an toàn.',
          [{ text: 'OK', style: 'default' }]
        );
      }
    });
    return () => subscription.remove();
  }, []);

  const handleSOS = () => {
    Alert.alert(
      '🆘 Xác nhận SOS',
      'Gửi SOS khẩn cấp cho Carepartner? Họ sẽ nhận thông báo ngay.',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Gửi SOS', style: 'destructive', onPress: async () => {
            setSosLoading(true);
            try {
              await triggerSOS({ task_id: taskId, message: 'Phụ huynh cần hỗ trợ khẩn cấp!' });
              Alert.alert('✅ Đã gửi', 'SOS đã được gửi tới Carepartner.');
            } catch (e) {
              Alert.alert('Lỗi', 'Không thể gửi SOS. Vui lòng gọi điện trực tiếp.');
            } finally {
              setSosLoading(false);
            }
          }
        },
      ]
    );
  };

  // Build OSM URL cho WebView
  // Sử dụng Leaflet qua WebView với OSM tiles
  const buildMapHtml = () => {
    if (!liveData?.is_tracking || !liveData?.location) return '';
    const loc = liveData.location;
    const workerLat = parseFloat(loc.latitude);
    const workerLng = parseFloat(loc.longitude);
    const parentLat = taskLatitude || null;
    const parentLng = taskLongitude || null;

    // Center map giữa worker và parent (hoặc chỉ worker nếu không có parent)
    const centerLat = parentLat ? (workerLat + parentLat) / 2 : workerLat;
    const centerLng = parentLng ? (workerLng + parentLng) / 2 : workerLng;
    const zoom = parentLat ? 14 : 16;

    const workerMarker = `
      L.marker([${workerLat}, ${workerLng}], {icon: workerIcon}).addTo(map)
        .bindPopup('<b>Carepartner</b><br>Đang ở đây');
    `;

    const parentMarker = parentLat ? `
      L.marker([${parentLat}, ${parentLng}], {icon: parentIcon}).addTo(map)
        .bindPopup('<b>Nhà bạn</b><br>Điểm đến');
      L.circle([${parentLat}, ${parentLng}], {
        color: '${COLORS.info}',
        fillColor: '${COLORS.info}',
        fillOpacity: 0.08,
        weight: 2,
        dashArray: '6,4',
        radius: ${GEOFENCE_RADIUS}
      }).addTo(map);
    ` : '';

    const routeLine = parentLat ? `
      L.polyline([[${workerLat}, ${workerLng}], [${parentLat}, ${parentLng}]], {
        color: '${COLORS.primary}', weight: 3, dashArray: '6,4', opacity: 0.7
      }).addTo(map);
    ` : '';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; }
    #map { background: #e8eaed; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${centerLat}, ${centerLng}], ${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    var workerIcon = L.divIcon({
      html: '<div style="background:${COLORS.primary};width:36px;height:36px;border-radius:18px;border:3px solid ${COLORS.surface};box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:${COLORS.textOnPrimary};font-size:18px;">🚶</div>',
      className: '', iconSize: [36, 36], iconAnchor: [18, 18]
    });
    var parentIcon = L.divIcon({
      html: '<div style="background:${COLORS.success};width:36px;height:36px;border-radius:18px;border:3px solid ${COLORS.surface};box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:${COLORS.textOnPrimary};font-size:18px;">🏠</div>',
      className: '', iconSize: [36, 36], iconAnchor: [18, 18]
    });

    ${workerMarker}
    ${parentMarker}
    ${routeLine}
  </script>
</body>
</html>`;
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceWarm} />
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.loadingText}>Đang tải vị trí...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
        <View style={[styles.header, { paddingTop: insets.top + 32 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Quay lại">
            <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Theo dõi CarePartner</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
          <Text style={styles.errorTitle}>Không thể xem vị trí</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  const isTracking = liveData?.is_tracking;
  const location = liveData?.location;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

      {/* Top App Bar — trắng theo Warm Professionalism */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Quay lại">
          <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{taskTitle || `Task #${taskId}`}</Text>
          {/*
            QA-FIX-2 / B3: hiển thị trạng thái rõ ràng cho phụ huynh:
              - LIVE (online, cập nhật < 30s): "● LIVE · cập nhật HH:MM:SS"
              - STALE (online nhưng vị trí cũ > 30s): "● VỊ TRÍ CUỐI · cập nhật HH:MM:SS"
              - OFFLINE (vượt ngưỡng cấu hình): "● MẤT TÍN HIỆU · lần cuối HH:MM:SS"
            Trước đây chỉ hiển thị LIVE/OFF — phụ huynh không phân biệt được
            vị trí live vs vị trí cuối cùng khi carepartner mất mạng.
          */}
          <Text style={styles.headerSub}>
            {isLocationOffline
              ? `● MẤT TÍN HIỆU · lần cuối ${liveData?.last_seen ? new Date(liveData.last_seen).toLocaleTimeString('vi-VN') : ''}`
              : isLocationStale
                ? `● VỊ TRÍ CUỐI · cập nhật ${liveData?.last_seen ? new Date(liveData.last_seen).toLocaleTimeString('vi-VN') : (lastUpdate ? lastUpdate.toLocaleTimeString('vi-VN') : '')}`
                : isTracking
                  ? '● LIVE · cập nhật ' + (lastUpdate ? lastUpdate.toLocaleTimeString('vi-VN') : '')
                  : 'Không có dữ liệu'}
          </Text>
        </View>
        <View style={[
          styles.liveBadge,
          !isTracking && !isLocationOffline && !isLocationStale && { backgroundColor: COLORS.outlineVariant },
          isLocationOffline && { backgroundColor: COLORS.error },
          isLocationStale && !isLocationOffline && { backgroundColor: COLORS.warning },
        ]}>
          <Text style={[
            styles.liveText,
            !isTracking && !isLocationOffline && !isLocationStale && { color: COLORS.onSurfaceVariant },
          ]}>
            {isLocationOffline ? 'OFFLINE' : isLocationStale ? 'STALE' : isTracking ? 'LIVE' : 'OFF'}
          </Text>
        </View>
      </View>

      {/* === DEVICE OFFLINE ALERT BANNER — cảnh báo khẩn cấp === */}
      {offlineAlertActive && deviceStatus?.active_alerts?.length > 0 && (
        <View style={styles.offlineAlertBanner}>
          <View style={styles.offlineAlertHeader}>
            <Ionicons name="warning" size={28} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.offlineAlertTitle}>🚨 THIẾT BỊ MẤT KẾT NỐI!</Text>
              <Text style={styles.offlineAlertSub}>
                Carepartner đã ngừng gửi tín hiệu. Có thể thiết bị bị tắt, mất mạng hoặc đập máy.
              </Text>
            </View>
          </View>
          {deviceStatus.last_location && (
            <Text style={styles.offlineAlertLocation}>
              📍 Vị trí cuối: {deviceStatus.last_location.latitude?.toFixed(5)}, {deviceStatus.last_location.longitude?.toFixed(5)}
            </Text>
          )}
          {deviceStatus.last_seen && (
            <Text style={styles.offlineAlertTime}>
              ⏰ Lần cuối online: {new Date(deviceStatus.last_seen).toLocaleString('vi-VN')}
              {' '}({deviceStatus.seconds_since_last_seen}s trước)
            </Text>
          )}
          <View style={styles.offlineAlertActions}>
            {/* Phan 2: "Đã biết" acknowledge → stop alarm + API acknowledge → backend dừng retry push */}
            <TouchableOpacity
              style={styles.offlineAlertAckBtn}
              onPress={() => handleAcknowledgeAlert(deviceStatus?.active_alerts?.[0]?.id)}
              accessibilityRole="button"
              accessibilityLabel="Đã biết, tắt cảnh báo"
            >
              <Ionicons name="checkmark-circle" size={16} color={COLORS.errorDeep} />
              <Text style={styles.offlineAlertAckText}>Đã biết</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.offlineAlertCallBtn}
              onPress={() => Linking.openURL('tel:113')}
              accessibilityRole="button"
              accessibilityLabel="Gọi 113"
            >
              <Ionicons name="call" size={16} color="#fff" />
              <Text style={styles.offlineAlertBtnText}>Gọi 113</Text>
            </TouchableOpacity>
            {/* Fix H14: chỉ mở dialer khi có số carepartner */}
            {workerPhone && (
              <TouchableOpacity
                style={styles.offlineAlertContactBtn}
                onPress={() => Linking.openURL(`tel:${workerPhone}`)}
                accessibilityRole="button"
                accessibilityLabel="Gọi Carepartner"
              >
                <Ionicons name="person" size={16} color="#fff" />
                <Text style={styles.offlineAlertBtnText}>Gọi CP</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* === DEVICE STATUS BAR — hiển thị trạng thái thiết bị (online/offline) === */}
      {deviceStatus?.has_heartbeat && !offlineAlertActive && (
        <View style={styles.deviceStatusBar}>
          <View style={styles.deviceStatusLeft}>
            <View style={[styles.deviceStatusDot, {
              backgroundColor: deviceStatus.is_offline ? COLORS.error : COLORS.success
            }]} />
            <Text style={styles.deviceStatusText}>
              {deviceStatus.is_offline ? '⚠️ Offline' : '🟢 Online'}
              {' · '}{deviceStatus.seconds_since_last_seen}s trước
            </Text>
          </View>
          {deviceStatus.battery_level != null && (
            <View style={styles.batteryBadge}>
              <Ionicons name="battery-half" size={12} color={deviceStatus.battery_level < 20 ? COLORS.error : COLORS.success} />
              <Text style={styles.batteryText}>{deviceStatus.battery_level}%</Text>
            </View>
          )}
        </View>
      )}

      {/* Map area */}
      <View style={styles.mapArea}>
        {isTracking && location ? (
          <View style={styles.mapPlaceholder}>
            {/* Map render: trong production sẽ dùng react-native-maps hoặc WebView Leaflet */}
            <View style={styles.mapTopBar}>
              <View style={styles.mapTopInfo}>
                <Text style={styles.mapTopTitle}>📍 Vị trí Carepartner</Text>
                <Text style={styles.mapTopCoords}>
                  {parseFloat(location.latitude).toFixed(5)}, {parseFloat(location.longitude).toFixed(5)}
                </Text>
              </View>
              {location.is_outside_geofence && (
                <View style={styles.geofenceBadge}>
                  <Ionicons name="warning" size={12} color="#fff" />
                  <Text style={styles.geofenceText}>Rời vùng an toàn</Text>
                </View>
              )}
            </View>

            <View style={styles.mapVisual}>
              <View style={styles.mapGrid} />
              <View style={[styles.mapStreet, { top: '30%', height: 14 }]} />
              <View style={[styles.mapStreet, { left: '25%', width: 14, top: 0, bottom: 0 }]} />
              <View style={[styles.mapStreet, { top: '70%', height: 10 }]} />

              {/* Carepartner marker (current location) */}
              <View style={[styles.mapMarker, { top: '33%', left: '22%' }]}>
                <View style={styles.markerIconWorker}>
                  <Text style={styles.markerEmoji}>🚶</Text>
                </View>
                <View style={styles.markerLabel}>
                  <Text style={styles.markerLabelText}>Carepartner</Text>
                </View>
              </View>

              {/* Parent home marker */}
              {taskLatitude && (
                <View style={[styles.mapMarker, { top: '50%', left: '50%' }]}>
                  <View style={styles.markerIconParent}>
                    <Text style={styles.markerEmoji}>🏠</Text>
                  </View>
                  <View style={styles.markerLabel}>
                    <Text style={styles.markerLabelText}>Nhà bạn</Text>
                  </View>
                </View>
              )}

              {/* Geofence circle */}
              {taskLatitude && (
                <View style={[styles.geofenceCircle, { top: '50%', left: '50%' }]} />
              )}
            </View>

            <Text style={styles.mapHint}>
              💡 Trong app thật, đây sẽ là bản đồ OpenStreetMap tương tác
            </Text>
          </View>
        ) : (
          <View style={styles.notTrackingBox}>
            <View style={styles.notTrackingIcon}>
              <Ionicons name="location-off-outline" size={48} color={COLORS.textMuted} />
            </View>
            <Text style={styles.notTrackingTitle}>Carepartner chưa chia sẻ vị trí</Text>
            <Text style={styles.notTrackingText}>
              {liveData?.message || 'Vị trí sẽ hiện tại đây khi carepartner bật chia sẻ.'}
            </Text>
          </View>
        )}
      </View>

      {/* Bottom Sheet */}
      {isTracking && location && (
        <View style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <View style={styles.sheetAvatar}>
              <Text style={styles.sheetAvatarText}>C</Text>
            </View>
            <View style={styles.sheetInfo}>
              <Text style={styles.sheetName}>Carepartner</Text>
              <Text style={styles.sheetStatus}>
                {location.is_outside_geofence ? '⚠️ Đã rời vùng an toàn' : '🟢 Đang làm việc'}
              </Text>
            </View>
            <View style={styles.sheetStats}>
              {location.speed != null && (
                <Text style={styles.sheetSpeed}>
                  {(parseFloat(location.speed) * 3.6).toFixed(1)} km/h
                </Text>
              )}
              {location.accuracy != null && (
                <Text style={styles.sheetAccuracy}>±{Math.round(parseFloat(location.accuracy))}m</Text>
              )}
            </View>
          </View>

          <View style={styles.sheetTimeRow}>
            <Ionicons name="time-outline" size={14} color={COLORS.textMuted} />
            <Text style={styles.sheetTimeText}>
              Cập nhật {lastUpdate ? lastUpdate.toLocaleTimeString('vi-VN') : '...'}
            </Text>
          </View>

          <View style={styles.sheetActions}>
            <TouchableOpacity style={[styles.actionBtn, styles.actionCall]} accessibilityRole="button" accessibilityLabel="Gọi điện cho CarePartner">
              <Ionicons name="call" size={16} color="#fff" />
              <Text style={styles.actionBtnTextWhite}>Gọi</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionMsg]}>
              <Ionicons name="chatbubble" size={16} color="#fff" />
              <Text style={styles.actionBtnTextWhite}>Nhắn</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionSos, sosLoading && { opacity: 0.6 }]}
              onPress={handleSOS}
              disabled={sosLoading}
             accessibilityRole="button" accessibilityLabel="Gửi tín hiệu SOS khẩn cấp">
              {sosLoading ? <ActivityIndicator size="small" color={COLORS.error} /> : (
                <>
                  <Ionicons name="alert-circle" size={16} color={COLORS.error} />
                  <Text style={styles.actionBtnTextSos}>SOS</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.surfaceWarm, gap: 12 },
  loadingText: { ...TYPO.body, color: COLORS.onSurfaceVariant },
  errorContainer: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  // Header — trắng theo Warm Professionalism
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingBottom: 14,
    backgroundColor: COLORS.surface, // trắng thay vì cam
    borderBottomWidth: 1, borderBottomColor: COLORS.outlineVariant,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.surfaceContainer,
    justifyContent: 'center', alignItems: 'center',
  },
  headerInfo: { flex: 1 },
  headerTitle: { ...TYPO.h4, color: COLORS.onSurface, fontWeight: '700' },
  headerSub: { ...TYPO.caption, color: COLORS.onSurfaceVariant, marginTop: 2 },
  liveBadge: {
    backgroundColor: COLORS.secondary, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  liveText: { color: COLORS.textOnPrimary, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  mapArea: { flex: 1 },
  mapPlaceholder: { flex: 1, backgroundColor: COLORS.surfaceContainerLow },
  mapTopBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.outlineVariant,
    ...SHADOWS.small,
  },
  mapTopInfo: { flex: 1 },
  mapTopTitle: { ...TYPO.bodySmall, color: COLORS.onSurface, fontWeight: '700' },
  mapTopCoords: { ...TYPO.caption, color: COLORS.onSurfaceVariant, marginTop: 2 },
  geofenceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.errorDeep, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  geofenceText: { color: COLORS.textOnPrimary, fontSize: 10, fontWeight: '700' },

  mapVisual: {
    flex: 1, position: 'relative',
    backgroundColor: '#e8eaed',
    backgroundImage: 'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)',
    backgroundSize: 30,
  },
  mapGrid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  mapStreet: {
    position: 'absolute',
    backgroundColor: '#fff',
    opacity: 0.8,
    left: 0, right: 0,
  },

  mapMarker: {
    position: 'absolute',
    transform: [{ translateX: -18 }, { translateY: -18 }],
    alignItems: 'center',
  },
  markerIconWorker: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.primary,
    borderWidth: 3, borderColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.large,
  },
  markerIconParent: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.success,
    borderWidth: 3, borderColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.large,
  },
  markerEmoji: { fontSize: 18 },
  markerLabel: {
    backgroundColor: '#fff', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    marginTop: 4, ...SHADOWS.small,
  },
  markerLabelText: { fontSize: 10, fontWeight: '700', color: COLORS.textPrimary },

  geofenceCircle: {
    position: 'absolute',
    width: 200, height: 200,
    borderRadius: 100,
    borderWidth: 2, borderColor: '#3b82f6',
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderStyle: 'dashed',
    transform: [{ translateX: -100 }, { translateY: -100 }],
  },

  mapHint: {
    position: 'absolute', bottom: 12, left: 12, right: 12,
    backgroundColor: 'rgba(0,0,0,0.7)', color: COLORS.textOnPrimary,
    fontSize: 11, textAlign: 'center', padding: 6, borderRadius: 6,
    overflow: 'hidden',
  },

  notTrackingBox: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: 32, gap: 12,
  },
  notTrackingIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.surfaceContainer,
    justifyContent: 'center', alignItems: 'center',
  },
  notTrackingTitle: { ...TYPO.h5, color: COLORS.onSurface },
  notTrackingText: { ...TYPO.bodySmall, color: COLORS.onSurfaceVariant, textAlign: 'center', lineHeight: 18 },

  errorBox: {
    flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32,
  },
  errorTitle: { ...TYPO.h5, color: COLORS.errorDeep },
  errorText: { ...TYPO.bodySmall, color: COLORS.onSurfaceVariant, textAlign: 'center' },

  // Bottom sheet — glass-like (surface + shadow + radius 24)
  bottomSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20, paddingBottom: 32,
    ...SHADOWS.large,
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderColor: COLORS.outlineVariant,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.outlineVariant,
    alignSelf: 'center', marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12,
  },
  sheetAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: COLORS.surface,
    ...SHADOWS.small,
  },
  sheetAvatarText: { color: COLORS.textOnPrimary, ...TYPO.h4, fontWeight: '800' },
  sheetInfo: { flex: 1 },
  sheetName: { ...TYPO.h4, color: COLORS.onSurface, fontWeight: '700' },
  sheetStatus: { ...TYPO.caption, color: COLORS.secondaryDark, marginTop: 2 },
  sheetStats: { alignItems: 'flex-end' },
  sheetSpeed: { ...TYPO.h5, color: COLORS.primary, fontWeight: '900' },
  sheetAccuracy: { ...TYPO.caption, color: COLORS.onSurfaceVariant, marginTop: 2 },

  sheetTimeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginBottom: 14, paddingHorizontal: 4,
  },
  sheetTimeText: { ...TYPO.caption, color: COLORS.onSurfaceVariant },

  // Actions — pill style, SOS nổi bật hơn (errorDeep bg, trắng text)
  sheetActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, height: 48, borderRadius: 14,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
    ...SHADOWS.small,
  },
  actionCall: { backgroundColor: COLORS.secondary }, // xanh lá (CarePartner identity)
  actionMsg: { backgroundColor: COLORS.surfaceContainer, borderWidth: 1, borderColor: COLORS.outlineVariant },
  actionSos: {
    backgroundColor: COLORS.errorDeep,
    // bỏ border, dùng shadow đỏ đậm
  },
  actionBtnTextWhite: { color: COLORS.textOnPrimary, ...TYPO.buttonSmall, fontWeight: '700' },
  actionBtnTextSos: { color: COLORS.textOnPrimary, ...TYPO.buttonSmall, fontWeight: '800', letterSpacing: 1 },

  // === OFFLINE ALERT BANNER — errorDeep bg theo DESIGN.md ===
  offlineAlertBanner: {
    backgroundColor: COLORS.errorDeep, // #ba1a1a — đậm hơn error hiện tại
    padding: 16, gap: 8,
    borderBottomWidth: 2, borderBottomColor: '#93000a', // on-error-container
    ...SHADOWS.large,
  },
  offlineAlertHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  offlineAlertTitle: {
    color: COLORS.textOnPrimary, ...TYPO.h4, fontWeight: '900', fontSize: 16,
  },
  offlineAlertSub: {
    color: 'rgba(255,255,255,0.95)', ...TYPO.bodySmall, marginTop: 2,
  },
  offlineAlertLocation: {
    color: COLORS.textOnPrimary, ...TYPO.caption, fontStyle: 'italic',
  },
  offlineAlertTime: {
    color: 'rgba(255,255,255,0.85)', ...TYPO.caption,
  },
  offlineAlertActions: {
    flexDirection: 'row', gap: 8, marginTop: 8,
  },
  // Phan 2: "Đã biết" acknowledge button (surface bg, errorDeep text)
  offlineAlertAckBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusSm, paddingVertical: 10,
    borderWidth: 1.5, borderColor: COLORS.errorDeep,
  },
  offlineAlertAckText: {
    color: COLORS.errorDeep, ...TYPO.buttonSmall, fontWeight: '800',
  },
  offlineAlertCallBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: SIZES.radiusSm, paddingVertical: 10,
  },
  offlineAlertContactBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: SIZES.radiusSm, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
  offlineAlertBtnText: {
    color: COLORS.textOnPrimary, ...TYPO.buttonSmall, fontWeight: '800',
  },

  // === DEVICE STATUS BAR ===
  // Device status bar — surface bg, outline-variant border
  deviceStatusBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.outlineVariant,
  },
  deviceStatusLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  deviceStatusDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  deviceStatusText: {
    ...TYPO.caption, color: COLORS.onSurfaceVariant, fontWeight: '600',
  },
  batteryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.surfaceContainer, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  batteryText: {
    ...TYPO.caption, color: COLORS.onSurfaceVariant, fontWeight: '700', fontSize: 11,
  },
});
