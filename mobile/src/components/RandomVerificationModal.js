// ====================================================================
// RandomVerificationModal — Modal full-screen bắt buộc xác minh trong ca
// ====================================================================
// - Hiện khi hệ thống bất ngờ yêu cầu xác minh (push type=random_verification)
// - Đếm ngược từ backend respond_deadline
// - Lặp lại còi báo động (channel emergency-alerts đã setup ở App.js)
// - Gọi API respond/ khi user bấm xác nhận
// - Hiện được trên mọi screen (đặt ở App root qua useRandomVerificationCheck)
//
// B5 — Xác thực bằng ảnh trong ca (verification_type='photo'):
// - Thay vì nhập PIN, hiện UI chụp ảnh: mở camera (expo-image-picker),
//   xem lại/chụp lại, gửi (multipart) + trạng thái upload + retry khi lỗi.
// - Âm thanh cảnh báo + rung: tái sử dụng EmergencyAlarmService
//   (expo-av loop emergency_alarm.wav + Vibration pattern) — KHÔNG thêm
//   dependency mới (expo-av + expo-image-picker đã có trong package.json).
// - Không viết push handler riêng: modal tự poll pending check mỗi 5s
//   (cơ chế hiện có), push chỉ là kênh báo hiệu.
//
// ⚠️ LƯU Ý VỀ EXPO GO:
// - Channel 'emergency-alerts' với sound custom KHÔNG hoạt động trên Expo Go.
// - Modal này VẪN hoạt động trên Expo Go (React Native UI không phụ thuộc
//   native notification). Còi audio trong app (expo-av) vẫn chạy foreground.
// - Push khi app killed do OS xử lý — iOS background restriction + Android
//   battery optimization có thể làm CHẬM/MẤT push. Fallback: khi user mở
//   app lại, poll 5s tự phát hiện check pending (kể cả đã miss push) và
//   modal hiện ngay + rung. KHÔNG đảm bảo 100% push tới — đây là giới hạn
//   nền tảng, đã giảm thiểu bằng poll + push retry (5 lần/30s) của backend.
//
// QA-FIX-2 / A1 + F: chỉ poll khi AuthContext đã load, user là worker
// và có session hợp lệ. QA-FIX-2 / G: dừng poll/listener khi logout/unmount.
// ====================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, Vibration, Platform, Image as RNImage,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {
  getPendingVerificationCheck, respondVerificationCheck,
  submitVerificationPhoto,
} from '../api/tracking';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../theme/colors';
import {
  playEmergencyAlarm, stopEmergencyAlarm, unloadEmergencyAlarm,
} from '../services/EmergencyAlarmService';

const POLL_INTERVAL_MS = 5000; // Poll pending check mỗi 5s
const VIBRATION_PATTERN = [1000, 500, 1000, 500, 1000, 500, 1000];

export default function RandomVerificationModal() {
  // QA-FIX-2 / A1 + F: chỉ poll khi user là worker đã đăng nhập
  const { user, isLoading: authLoading } = useAuth();
  const isWorker = user?.role === 'worker';

  const [check, setCheck] = useState(null); // { check_id, task_id, respond_deadline, seconds_remaining, verification_type }
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  // B5 — state cho luồng chụp ảnh
  const [photo, setPhoto] = useState(null);      // { uri, width, height } từ ImagePicker
  const [cameraBusy, setCameraBusy] = useState(false); // đang mở camera
  const [photoError, setPhotoError] = useState('');   // lỗi upload/permission (tiếng Việt)
  const pollRef = useRef(null);
  const countdownRef = useRef(null);
  const lastCheckIdRef = useRef(null);
  // B5: theo dõi type của check đang hiển thị để bật/tắt alarm đúng lúc
  const lastCheckTypeRef = useRef(null);

  // Dọn dẹp state photo khi check đổi / biến mất
  const resetPhotoState = useCallback(() => {
    setPhoto(null);
    setPhotoError('');
  }, []);

  // B5 — dừng mọi cảnh báo (alarm + vibration)
  const stopAllAlerts = useCallback(async () => {
    try {
      Vibration.cancel();
      await stopEmergencyAlarm();
    } catch (e) { /* non-fatal */ }
  }, []);

  // Poll pending check từ backend
  // QA-FIX-2 / A1 + F: chỉ poll khi isWorker=true và authLoading=false.
  const fetchPendingCheck = useCallback(async () => {
    if (!isWorker) return;  // parent/admin không có check
    try {
      const res = await getPendingVerificationCheck();
      if (res.data?.has_pending) {
        const newCheck = res.data;
        // Nếu là check mới (id khác) → rung + còi + reset state cũ
        if (lastCheckIdRef.current !== newCheck.check_id) {
          lastCheckIdRef.current = newCheck.check_id;
          lastCheckTypeRef.current = newCheck.verification_type || 'pin';
          setCheck(newCheck);
          setSecondsRemaining(newCheck.seconds_remaining || 90);
          setPin('');
          resetPhotoState();

          // B5 — check loại photo: còi to + rung liên tục (âm thanh + rung
          // theo yêu cầu B5). Check PIN: giữ Vibration như cũ (tránh đổi
          // hành vi luồng PIN đã QA).
          if (newCheck.verification_type === 'photo') {
            playEmergencyAlarm().catch(() => { /* fallback Vibration bên trong service */ });
          } else {
            Vibration.vibrate(VIBRATION_PATTERN, true);
          }

          // Schedule local notification (channel emergency-alerts) —
          // fallback khi app foreground nhưng user đang ở screen khác.
          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: newCheck.verification_type === 'photo'
                  ? '📸 Xác minh bằng ảnh'
                  : '🔐 Xác minh bảo mật',
                body: newCheck.verification_type === 'photo'
                  ? 'Chụp 1 ảnh tại chỗ để xác nhận vẫn đang cầm máy'
                  : 'Vui lòng nhập mã cá nhân để xác nhận',
                sound: 'default',
                priority: Notifications.AndroidNotificationPriority.HIGH,
                android: {
                  channelId: 'emergency-alerts',
                },
                data: {
                  type: 'random_verification',
                  verification_type: newCheck.verification_type || 'pin',
                  task_id: newCheck.task_id,
                  check_id: newCheck.check_id,
                },
              },
              trigger: null,
            });
          } catch (e) { /* ignore */ }
        } else {
          // Cùng check → chỉ update seconds_remaining
          setSecondsRemaining(newCheck.seconds_remaining || 0);
        }
      } else {
        // Không có check pending → ẩn modal + dừng rung/còi + dọn state
        if (lastCheckIdRef.current !== null) {
          lastCheckIdRef.current = null;
          lastCheckTypeRef.current = null;
          setCheck(null);
          setPin('');
          resetPhotoState();
          stopAllAlerts();
        }
      }
    } catch (e) {
      // Silent fail — không log (tránh spam khi offline)
    }
  }, [isWorker, resetPhotoState, stopAllAlerts]);

  // Poll pending check mỗi 5s
  // QA-FIX-2 / A1 + F: chỉ start poll khi isWorker + authLoading=false.
  // Khi logout (user=null, isWorker=false) → cleanup interval.
  useEffect(() => {
    if (authLoading || !isWorker) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      // Reset state khi không còn worker (logout)
      if (lastCheckIdRef.current !== null) {
        lastCheckIdRef.current = null;
        lastCheckTypeRef.current = null;
        setCheck(null);
        setPin('');
        resetPhotoState();
        stopAllAlerts();
      }
      return;
    }

    fetchPendingCheck();
    pollRef.current = setInterval(fetchPendingCheck, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      // QA-FIX-2 / G: dừng vibration + alarm khi unmount/logout
      stopAllAlerts();
    };
  }, [fetchPendingCheck, isWorker, authLoading, resetPhotoState, stopAllAlerts]);

  // B5 — giải phóng audio resource khi component unmount hẳn (tránh leak
  // khi app background/foreground liên tục)
  useEffect(() => () => { unloadEmergencyAlarm().catch(() => {}); }, []);

  // Countdown mỗi 1s
  useEffect(() => {
    if (!check) return;
    countdownRef.current = setInterval(() => {
      setSecondsRemaining((s) => {
        if (s <= 1) {
          // Hết giờ → backend sẽ tự set 'timeout' khi poll tiếp
          stopAllAlerts();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [check?.check_id, stopAllAlerts]);

  // Lấy vị trí hiện tại để gửi kèm khi respond
  const getCurrentLocation = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
    } catch (e) {
      return null;
    }
  };

  const handleRespond = async () => {
    if (!check) return;
    if (!/^\d{4,6}$/.test(pin)) {
      Alert.alert('Lỗi', 'Mã phải là 4-6 chữ số.');
      return;
    }

    setSubmitting(true);
    try {
      const location = await getCurrentLocation();
      await respondVerificationCheck(check.check_id, {
        pin,
        // QA-FIX-2 / E: dùng ?? null thay vì || null — tọa độ 0 hợp lệ
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
      });

      // Thành công → ẩn modal + dừng rung
      Vibration.cancel();
      Alert.alert('✅ Đã xác nhận', 'Cảm ơn bạn đã phản hồi kịp thời.');
      lastCheckIdRef.current = null;
      setCheck(null);
      setPin('');
    } catch (e) {
      const msg = e?.response?.data?.error || 'Không thể phản hồi. Vui lòng thử lại.';
      if (e?.response?.status === 400) {
        // Có thể là "sai mã — còn N lần" hoặc "đã hết thời gian"
        Alert.alert('Không thành công', msg);
        setPin('');
        // Nếu check đã kết thúc (timeout/wrong_code) → poll lại sẽ ẩn modal
        if (msg.includes('hết thời gian') || msg.includes('bị khoé')) {
          setTimeout(fetchPendingCheck, 1500);
        }
      } else {
        Alert.alert('Lỗi', msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ════════════════════════════════════════════════════════════════
  //  B5 — LUỒNG CHỤP ẢNH XÁC MINH
  // ════════════════════════════════════════════════════════════════

  // Mở camera chụp ảnh (yêu cầu quyền camera nếu chưa có)
  const handleTakePhoto = async () => {
    if (cameraBusy) return;
    setCameraBusy(true);
    setPhotoError('');
    try {
      // Xin quyền camera — xử lý quyền bị từ chối rõ ràng
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setPhotoError(
          'Không có quyền truy cập camera. Vào Cài đặt → Ứng dụng → EduCareLink → cho phép Camera để chụp ảnh xác minh.'
        );
        Alert.alert(
          '⚠️ Cần quyền camera',
          'Vui lòng vào Cài đặt của điện thoại, cho phép EduCareLink truy cập Camera, rồi thử lại.',
          [
            { text: 'Đã hiểu' },
            // Mở settings device để user bật quyền nhanh
            ...(Platform.OS !== 'web' ? [{
              text: 'Mở Cài đặt',
              onPress: () => {
                try {
                  const { Linking } = require('react-native');
                  Linking.openSettings?.();
                } catch (e) { /* ignore */ }
              },
            }] : []),
          ],
        );
        return;
      }

      // Mở camera — quality 0.7 để giảm dung lượng (giới hạn backend 5MB),
      // allowsEditing=false giữ ảnh gốc (không crop để chống chỉnh sửa vị trí)
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsEditing: false,
        exif: false,
      });

      if (result.canceled || !result.assets?.length) {
        // User đóng camera mà không chụp — không coi là lỗi, vẫn đang chờ
        return;
      }

      const asset = result.assets[0];
      // Kiểm tra client-side dung lượng trước khi upload (backend vẫn validate lại)
      const MAX_MB = 5;
      if (asset.fileSize && asset.fileSize > MAX_MB * 1024 * 1024) {
        setPhotoError(
          `Ảnh quá lớn (${(asset.fileSize / 1024 / 1024).toFixed(1)}MB, giới hạn ${MAX_MB}MB). Vui lòng chụp lại.`
        );
        return;
      }
      setPhoto({ uri: asset.uri, width: asset.width, height: asset.height });
    } catch (e) {
      // Một số thiết bị không có camera (máy yếu/tablet rẻ) → lỗi native
      setPhotoError(
        'Không mở được camera. Thiết bị có thể không có camera hoặc đang bị ứng dụng khác sử dụng — vui lòng thử lại.'
      );
    } finally {
      setCameraBusy(false);
    }
  };

  // Gửi ảnh đã chụp lên backend
  const handleSubmitPhoto = async () => {
    if (!check || !photo) return;
    setSubmitting(true);
    setPhotoError('');
    try {
      const location = await getCurrentLocation();
      await submitVerificationPhoto(check.check_id, {
        photo: { uri: photo.uri, name: 'verification.jpg', type: 'image/jpeg' },
        // QA-FIX-2 / E: tọa độ 0 hợp lệ — dùng ?? null
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
      });

      // Thành công → dừng còi + ẩn modal
      await stopAllAlerts();
      Alert.alert(
        '✅ Đã gửi ảnh xác minh',
        'Cảm ơn bạn đã phản hồi kịp thời. Phụ huynh đã được thông báo.'
      );
      lastCheckIdRef.current = null;
      lastCheckTypeRef.current = null;
      setCheck(null);
      resetPhotoState();
    } catch (e) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.error;
      if (status === 400 && msg) {
        // Lỗi nghiệp vụ từ backend (hết hạn / đã nộp / sai loại / file hỏng)
        // → poll lại để sync state (check có thể đã timeout/confirmed)
        setPhotoError(msg);
        setTimeout(fetchPendingCheck, 1500);
      } else if (e?.code === 'ECONNABORTED' || !e?.response) {
        // Timeout / mất mạng — KHÔNG tự thêm queue phức tạp (app chưa có hạ
        // tầng queue ảnh). Báo lỗi rõ ràng + nút thử lại; ảnh vẫn còn trong
        // state nên user bấm "Gửi lại" ngay khi có mạng.
        setPhotoError(
          'Không gửi được ảnh (mạng chậm hoặc mất kết nối). Ảnh vẫn còn — bấm "Gửi lại" khi có mạng, hoặc chụp ảnh mới.'
        );
      } else {
        setPhotoError(msg || 'Không gửi được ảnh. Vui lòng thử lại.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Không hiện modal nếu không có check pending
  if (!check) return null;

  const isUrgent = secondsRemaining <= 30;
  const isCritical = secondsRemaining <= 10;
  const isPhotoCheck = check.verification_type === 'photo';

  // ════════════════════════════════════════════════════════════════
  //  RENDER — PHOTO MODE (B5)
  // ════════════════════════════════════════════════════════════════
  if (isPhotoCheck) {
    return (
      <Modal
        visible={true}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {
          // Chặn đóng modal bằng nút back (Android) — bắt buộc phải phản hồi
          Alert.alert(
            '⚠️ Không thể bỏ qua',
            'Bạn phải chụp ảnh xác minh để tiếp tục. Hệ thống đang đảm bảo an toàn cho phụ huynh và trẻ.',
          );
        }}
      >
        <ScrollView
          style={[styles.container, isCritical && styles.containerCritical]}
          contentContainerStyle={styles.containerContent}
        >
          <View style={styles.iconRow}>
            <Ionicons name="camera" size={64} color={COLORS?.primary || '#F26522'} />
          </View>

          <Text style={styles.title}>📸 Xác minh bằng ảnh</Text>
          <Text style={styles.subtitle}>
            Hệ thống yêu cầu bạn chụp 1 ảnh tại chỗ (selfie hoặc không gian xung quanh)
            để xác nhận vẫn đang cầm máy. Ảnh sẽ được gửi cho phụ huynh.
          </Text>

          <View style={[styles.countdownBox, isUrgent && styles.countdownUrgent]}>
            <Text style={[styles.countdownText, isUrgent && styles.countdownTextUrgent]}>
              ⏱ {Math.floor(secondsRemaining / 60)}:{String(secondsRemaining % 60).padStart(2, '0')}
            </Text>
            <Text style={styles.countdownLabel}>giây còn lại</Text>
          </View>

          {/* Ảnh đã chụp — xem lại trước khi gửi */}
          {photo && (
            <View style={styles.photoPreviewWrap}>
              <RNImage
                source={{ uri: photo.uri }}
                style={styles.photoPreview}
                resizeMode="cover"
              />
              <Text style={styles.photoPreviewHint}>Xem lại ảnh trước khi gửi</Text>
            </View>
          )}

          {/* Lỗi hiển thị inline (permission / upload / validate) */}
          {photoError ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color="#EF4444" />
              <Text style={styles.errorText}>{photoError}</Text>
            </View>
          ) : null}

          {/* Trạng thái đang upload */}
          {submitting ? (
            <View style={styles.uploadingBox}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.uploadingText}>Đang gửi ảnh...</Text>
            </View>
          ) : photo ? (
            <View style={styles.photoActions}>
              <TouchableOpacity
                style={styles.retakeBtn}
                onPress={handleTakePhoto}
                disabled={cameraBusy}
              >
                <Ionicons name="refresh" size={18} color={COLORS?.primary || '#F26522'} />
                <Text style={styles.retakeBtnText}>Chụp lại</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmitPhoto}>
                <Ionicons name="send" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>Gửi ảnh</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.submitBtn, styles.cameraBtn]}
              onPress={handleTakePhoto}
              disabled={cameraBusy}
            >
              {cameraBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="camera" size={20} color="#fff" />
                  <Text style={styles.submitBtnText}>Chụp ảnh xác minh</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <Text style={styles.warning}>
            ⚠️ Nếu không phản hồi trong thời hạn, hệ thống sẽ báo admin và có thể báo phụ huynh.
          </Text>
        </ScrollView>
      </Modal>
    );
  }

  // ════════════════════════════════════════════════════════════════
  //  RENDER — PIN MODE (giữ nguyên luồng hiện có)
  // ════════════════════════════════════════════════════════════════
  return (
    <Modal
      visible={true}
      animationType="slide"
      transparent={false}
      onRequestClose={() => {
        // Chặn đóng modal bằng nút back (Android) — bắt buộc phải phản hồi
        Alert.alert(
          '⚠️ Không thể bỏ qua',
          'Bạn phải nhập mã xác minh để tiếp tục. Hệ thống đang đảm bảo an toàn cho phụ huynh và trẻ.',
        );
      }}
    >
      <View style={[styles.container, isCritical && styles.containerCritical]}>
        <View style={styles.iconRow}>
          <Ionicons name="shield-checkmark" size={64} color={COLORS?.primary || '#F26522'} />
        </View>

        <Text style={styles.title}>🔐 Xác minh bảo mật</Text>
        <Text style={styles.subtitle}>
          Hệ thống yêu cầu bạn nhập mã cá nhân để xác nhận vẫn đang cầm máy.
        </Text>

        <View style={[styles.countdownBox, isUrgent && styles.countdownUrgent]}>
          <Text style={[styles.countdownText, isUrgent && styles.countdownTextUrgent]}>
            ⏱ {Math.floor(secondsRemaining / 60)}:{String(secondsRemaining % 60).padStart(2, '0')}
          </Text>
          <Text style={styles.countdownLabel}>giây còn lại</Text>
        </View>

        <TextInput
          style={styles.pinInput}
          value={pin}
          onChangeText={setPin}
          placeholder="Nhập mã cá nhân"
          keyboardType="number-pad"
          maxLength={6}
          secureTextEntry
          autoFocus
          editable={!submitting}
        />

        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={handleRespond}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>Xác nhận</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.forgotPinHint}>
          Quên mã? Vào Hồ sơ để đổi mã mới sau khi hoàn tất xác minh này hoặc liên hệ hỗ trợ.
        </Text>

        <Text style={styles.warning}>
          ⚠️ Nếu không phản hồi trong thời hạn, hệ thống sẽ báo admin và có thể báo phụ huynh.
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8F0',
  },
  containerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    paddingBottom: 48,
  },
  containerCritical: {
    backgroundColor: '#FFF0F0',
  },
  iconRow: { marginBottom: 16 },
  title: {
    fontSize: 24, fontWeight: '800',
    color: COLORS?.textPrimary || '#1A1A2E',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS?.textSecondary || '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  countdownBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 16, paddingHorizontal: 32,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#F26522',
  },
  countdownUrgent: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  countdownText: {
    fontSize: 36, fontWeight: '900',
    color: '#F26522',
    fontVariant: ['tabular-nums'],
  },
  countdownTextUrgent: {
    color: '#EF4444',
  },
  countdownLabel: {
    fontSize: 12, color: '#6B7280',
    marginTop: 4,
  },
  pinInput: {
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 16,
    fontSize: 24, fontWeight: '700',
    color: COLORS?.textPrimary || '#1A1A2E',
    width: '100%',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 4,
  },
  // B5 — photo mode styles
  photoPreviewWrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  photoPreview: {
    width: '100%',
    height: 320,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
  },
  photoPreviewHint: {
    fontSize: 12, color: '#9CA3AF',
    marginTop: 8,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    width: '100%',
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#DC2626',
    lineHeight: 18,
  },
  uploadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS?.primary || '#F26522',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  uploadingText: {
    color: '#fff', fontSize: 15, fontWeight: '700',
  },
  photoActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 8,
  },
  retakeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: COLORS?.primary || '#F26522',
    borderRadius: 12,
    paddingVertical: 16,
  },
  retakeBtnText: {
    color: COLORS?.primary || '#F26522',
    fontSize: 15, fontWeight: '700',
  },
  cameraBtn: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  submitBtn: {
    backgroundColor: COLORS?.primary || '#F26522',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    width: '100%',
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  forgotPinHint: {
    fontSize: 11, color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 12, lineHeight: 16,
  },
  warning: {
    fontSize: 12, color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 16, lineHeight: 16,
  },
});
