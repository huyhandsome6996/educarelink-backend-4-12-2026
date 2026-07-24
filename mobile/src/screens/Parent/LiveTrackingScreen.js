import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, Alert, Platform, Linking,
  ScrollView, RefreshControl, Animated, Vibration, AppState,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import {
  getLiveLocation, getLocationHistory, triggerSOS, revokeConsent,
  getDeviceStatus, getOfflineAlerts,
} from '../../api/tracking';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

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
  const pollRef = useRef(null);
  const deviceStatusPollRef = useRef(null);
  const lastAlertIdRef = useRef(null);

  // Poll live location
  const fetchLive = useCallback(async () => {
    if (!taskId) return;
    try {
      const res = await getLiveLocation(taskId);
      setLiveData(res.data);
      setLastUpdate(new Date());
      setError(null);
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
        triggerAlarmSound();
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
    };
    // Fix H11: thêm taskId trực tiếp vào deps để khi taskId đổi (vd: từ
    // navigation param), fetchLive/fetchDeviceStatus được re-bind và poll
    // lại data của task mới. Trước đây deps chỉ có callback refs → stale
    // callback khi taskId undefined lúc mount.
  }, [fetchLive, fetchDeviceStatus, taskId]);

  // Trigger alarm sound + vibration khi có offline alert
  const triggerAlarmSound = async () => {
    try {
      // Vibration pattern khẩn cấp: 1s rung, 0.5s nghỉ, lặp 5 lần
      Vibration.vibrate([1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000], false);

      // Schedule local notification với sound default (đảm bảo available)
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🚨🚨🚨 CẢNH BÁO KHẨN CẤP",
          body: "Thiết bị Carepartner đã ngừng gửi tín hiệu! Vui lòng kiểm tra ngay.",
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: {
            type: 'device_offline',
            task_id: taskId,
            priority: 'high',
          },
        },
        trigger: null, // ngay lập tức
      });
    } catch (e) {
      console.warn('triggerAlarmSound failed:', e);
    }
  };

  // Listen notification khi app đang mở
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data || {};
      const body = notification.request.content.body || '';

      // === DEVICE OFFLINE alert ===
      if (data.type === 'device_offline') {
        // Vibration pattern khẩn cấp
        Vibration.vibrate([1000, 500, 1000, 500, 1000, 500, 1000], false);
        Alert.alert(
          "🚨🚨🚨 CẢNH BÁO KHẨN CẤP",
          body || 'Thiết bị Carepartner mất kết nối!',
          [
            { text: 'Đã biết', style: 'destructive' },
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
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.08,
        weight: 2,
        dashArray: '6,4',
        radius: ${GEOFENCE_RADIUS}
      }).addTo(map);
    ` : '';

    const routeLine = parentLat ? `
      L.polyline([[${workerLat}, ${workerLng}], [${parentLat}, ${parentLng}]], {
        color: '#F26522', weight: 3, dashArray: '6,4', opacity: 0.7
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
      html: '<div style="background:#F26522;width:36px;height:36px;border-radius:18px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;">🚶</div>',
      className: '', iconSize: [36, 36], iconAnchor: [18, 18]
    });
    var parentIcon = L.divIcon({
      html: '<div style="background:#10B981;width:36px;height:36px;border-radius:18px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;">🏠</div>',
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
        <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.loadingText}>Đang tải vị trí...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Theo dõi Carepartner</Text>
          <View style={{ width: 40 }} />
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
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* Top Bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{taskTitle || `Task #${taskId}`}</Text>
          <Text style={styles.headerSub}>
            {isTracking ? '● LIVE · cập nhật ' + (lastUpdate ? lastUpdate.toLocaleTimeString('vi-VN') : '') : 'Không có dữ liệu'}
          </Text>
        </View>
        <View style={[styles.liveBadge, !isTracking && { backgroundColor: COLORS.divider }]}>
          <Text style={[styles.liveText, !isTracking && { color: COLORS.textMuted }]}>
            {isTracking ? 'LIVE' : 'OFF'}
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
            <TouchableOpacity
              style={styles.offlineAlertCallBtn}
              onPress={() => Linking.openURL('tel:113')}
            >
              <Ionicons name="call" size={16} color="#fff" />
              <Text style={styles.offlineAlertBtnText}>Gọi 113</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.offlineAlertContactBtn}
              onPress={() => Linking.openURL('tel:')}
            >
              <Ionicons name="person" size={16} color="#fff" />
              <Text style={styles.offlineAlertBtnText}>Gọi carepartner</Text>
            </TouchableOpacity>
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
            <TouchableOpacity style={[styles.actionBtn, styles.actionCall]}>
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
            >
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
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background, gap: 12 },
  loadingText: { ...TYPO.body, color: COLORS.textSecondary },
  errorContainer: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingTop: 56, paddingBottom: 14,
    backgroundColor: COLORS.primary,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerInfo: { flex: 1 },
  headerTitle: { ...TYPO.h5, color: '#fff', fontWeight: '700' },
  headerSub: { ...TYPO.caption, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  liveBadge: {
    backgroundColor: '#10B981', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  liveText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  mapArea: { flex: 1 },
  mapPlaceholder: { flex: 1, backgroundColor: '#e8eaed' },
  mapTopBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
    ...SHADOWS.small,
  },
  mapTopInfo: { flex: 1 },
  mapTopTitle: { ...TYPO.bodySmall, color: COLORS.textPrimary, fontWeight: '700' },
  mapTopCoords: { ...TYPO.caption, color: COLORS.textMuted, marginTop: 2 },
  geofenceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.error, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  geofenceText: { color: '#fff', fontSize: 10, fontWeight: '700' },

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
    backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff',
    fontSize: 11, textAlign: 'center', padding: 6, borderRadius: 6,
    overflow: 'hidden',
  },

  notTrackingBox: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: 32, gap: 12,
  },
  notTrackingIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.background,
    justifyContent: 'center', alignItems: 'center',
  },
  notTrackingTitle: { ...TYPO.h5, color: COLORS.textPrimary },
  notTrackingText: { ...TYPO.bodySmall, color: COLORS.textMuted, textAlign: 'center', lineHeight: 18 },

  errorBox: {
    flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32,
  },
  errorTitle: { ...TYPO.h5, color: COLORS.error },
  errorText: { ...TYPO.bodySmall, color: COLORS.textSecondary, textAlign: 'center' },

  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16, paddingBottom: 28,
    ...SHADOWS.large,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.divider,
    alignSelf: 'center', marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10,
  },
  sheetAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.small,
  },
  sheetAvatarText: { color: '#fff', ...TYPO.h5, fontWeight: '800' },
  sheetInfo: { flex: 1 },
  sheetName: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  sheetStatus: { ...TYPO.caption, color: COLORS.success, marginTop: 2 },
  sheetStats: { alignItems: 'flex-end' },
  sheetSpeed: { ...TYPO.h5, color: COLORS.primary, fontWeight: '900' },
  sheetAccuracy: { ...TYPO.caption, color: COLORS.textMuted, marginTop: 2 },

  sheetTimeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginBottom: 12, paddingHorizontal: 4,
  },
  sheetTimeText: { ...TYPO.caption, color: COLORS.textMuted },

  sheetActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, height: 44, borderRadius: 10,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
  },
  actionCall: { backgroundColor: COLORS.success },
  actionMsg: { backgroundColor: COLORS.info },
  actionSos: {
    backgroundColor: COLORS.errorBg,
    borderWidth: 1.5, borderColor: '#fecaca',
  },
  actionBtnTextWhite: { color: '#fff', ...TYPO.buttonSmall },
  actionBtnTextSos: { color: COLORS.error, ...TYPO.buttonSmall, fontWeight: '800' },

  // === OFFLINE ALERT BANNER ===
  offlineAlertBanner: {
    backgroundColor: COLORS.error,
    padding: 16, gap: 8,
    borderBottomWidth: 2, borderBottomColor: '#991B1B',
    ...SHADOWS.large,
  },
  offlineAlertHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  offlineAlertTitle: {
    color: '#fff', ...TYPO.h4, fontWeight: '900', fontSize: 16,
  },
  offlineAlertSub: {
    color: 'rgba(255,255,255,0.95)', ...TYPO.bodySmall, marginTop: 2,
  },
  offlineAlertLocation: {
    color: '#fff', ...TYPO.caption, fontStyle: 'italic',
  },
  offlineAlertTime: {
    color: 'rgba(255,255,255,0.85)', ...TYPO.caption,
  },
  offlineAlertActions: {
    flexDirection: 'row', gap: 8, marginTop: 8,
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
    color: '#fff', ...TYPO.buttonSmall, fontWeight: '800',
  },

  // === DEVICE STATUS BAR ===
  deviceStatusBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  deviceStatusLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  deviceStatusDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  deviceStatusText: {
    ...TYPO.caption, color: COLORS.textSecondary, fontWeight: '600',
  },
  batteryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.background, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  batteryText: {
    ...TYPO.caption, color: COLORS.textSecondary, fontWeight: '700', fontSize: 11,
  },
});
