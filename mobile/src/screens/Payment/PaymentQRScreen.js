// ============================================================
// PaymentQRScreen — VIETQR GATE (feature/vietqr-payment-gate-booking)
// Màn hình chờ phụ huynh quét QR VietQR (PayOS) sau khi chọn CarePartner:
//   - Hiển thị ảnh QR (base64 PayOS trả về) hoặc nút mở checkout page
//   - Đồng hồ đếm ngược tới qr_expires_at
//   - Polling GET /payments/<id>/status/ mỗi 4s → status 'held' →
//     trạng thái THÀNH CÔNG (booking đã xác nhận, task in_progress)
//   - Nút "Huỷ" → POST /payments/<id>/cancel-selection/ → task về 'open'
//   - QR hết hạn → cho "Tạo lại QR" (payos-setup) hoặc "Huỷ lựa chọn"
// Điểm vào:
//   - CandidatesScreen: approve trả next_step='create_payos_payment'
//   - ParentHomeScreen: mở lại app còn task 'pending_payment' → điều
//     hướng thẳng về màn này (resume giữa chừng)
// ============================================================

import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert, ActivityIndicator,
  ScrollView, Platform, Linking, Animated, Image,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {Ionicons} from '@expo/vector-icons';
import {setupPayOS, getPaymentStatus, cancelSelection} from '../../api/payments';
import {COLORS, SHADOWS, SIZES, TYPO} from '../../theme/colors';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

const POLL_INTERVAL_MS = 4000;   // polling 4s (spec: 3-5s)
const FALLBACK_SECONDS = 15 * 60; // backend không trả hạn → mặc định 15 phút

function parseExpiry(iso) {
  if (!iso) return null;
  const t = Date.parse(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
  return Number.isNaN(t) ? null : t;
}

export default function PaymentQRScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const params = route.params || {};
  const {
    paymentId, taskId, taskTitle, taskPrice, workerName,
    checkoutUrl: initialCheckoutUrl, qrCode: initialQrCode,
    qrExpiresAt: initialExpiresAt,
  } = params;

  const [checkoutUrl, setCheckoutUrl] = useState(initialCheckoutUrl || null);
  const [qrCode, setQrCode] = useState(initialQrCode || null);
  const [expiresAt, setExpiresAt] = useState(
    parseExpiry(initialExpiresAt) || (Date.now() + FALLBACK_SECONDS * 1000));
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [phase, setPhase] = useState('waiting'); // waiting | success | expired | cancelling
  const [busy, setBusy] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  const pollRef = useRef(null);
  const settledRef = useRef(false); // chặn poll/timer sau khi đạt kết quả

  // ── Countdown ─────────────────────────────────────────────────
  useEffect(() => {
    if (settledRef.current) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) setPhase(p => (p === 'waiting' ? 'expired' : p));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, phase === 'waiting']);

  const mm = secondsLeft != null ? String(Math.floor(secondsLeft / 60)).padStart(2, '0') : '--';
  const ss = secondsLeft != null ? String(secondsLeft % 60).padStart(2, '0') : '--';

  // ── Polling trạng thái (held → success) ───────────────────────
  const pollOnce = useCallback(async () => {
    if (settledRef.current || !paymentId) return;
    try {
      const res = await getPaymentStatus(paymentId);
      const data = res.data || {};
      setPollCount(c => c + 1);
      if (data.status === 'held') {
        settledRef.current = true;
        clearInterval(pollRef.current);
        setPhase('success');
      } else if (data.task_status === 'open' || data.status === 'cancelled') {
        // Backend đã rollback (cron expiry / huỷ nơi khác)
        settledRef.current = true;
        clearInterval(pollRef.current);
        setPhase('expired');
      }
    } catch (e) {
      // Mất mạng 1-2 nhịp polling — bỏ qua, nhịp sau thử lại
    }
  }, [paymentId]);

  useEffect(() => {
    if (!paymentId) return;
    pollRef.current = setInterval(pollOnce, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [paymentId, pollOnce]);

  // ── Huỷ lựa chọn ──────────────────────────────────────────────
  const handleCancel = () => {
    const doCancel = async () => {
      setBusy(true);
      try {
        await cancelSelection(paymentId);
        settledRef.current = true;
        clearInterval(pollRef.current);
        // Về màn danh sách ứng viên (kèm refresh) — chọn người khác
        if (navigation.canGoBack && navigation.canGoBack()) {
          navigation.navigate({name: 'Candidates', params: {refreshTs: Date.now()}, merge: true});
          navigation.goBack();
        } else {
          navigation.popToTop();
        }
      } catch (e) {
        const msg = e.response?.data?.error || 'Không huỷ được lựa chọn. Vui lòng thử lại.';
        if (Platform.OS === 'web') alert(msg);
        else Alert.alert('Lỗi', msg);
      } finally {
        setBusy(false);
      }
    };
    const msg = 'Huỷ lựa chọn này? CarePartner sẽ KHÔNG còn được đặt, bạn có thể chọn người khác.';
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doCancel();
    } else {
      Alert.alert('Huỷ lựa chọn', msg, [
        {text: 'Tiếp tục thanh toán', style: 'cancel'},
        {text: 'Huỷ lựa chọn', style: 'destructive', onPress: doCancel},
      ]);
    }
  };

  // ── Tạo lại QR khi hết hạn ────────────────────────────────────
  const handleRecreate = async () => {
    setBusy(true);
    try {
      const res = await setupPayOS(taskId);
      const d = res.data || {};
      setCheckoutUrl(d.checkout_url);
      setQrCode(d.qr_code || null);
      setExpiresAt(parseExpiry(d.qr_expires_at) || (Date.now() + FALLBACK_SECONDS * 1000));
      settledRef.current = false;
      setPhase('waiting');
    } catch (e) {
      // Có thể backend cron đã rollback (task về 'open') → lỗi "chưa ở trạng
      // thái chờ thanh toán" → quay lại danh sách ứng viên để chọn lại.
      const msg = e.response?.data?.error || 'Không tạo lại được QR.';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Lỗi', msg, [
        {text: 'OK', onPress: () => {
          navigation.navigate({name: 'Candidates', params: {refreshTs: Date.now()}, merge: true});
          navigation.goBack();
        }},
      ]);
    } finally {
      setBusy(false);
    }
  };

  const openCheckout = async () => {
    if (!checkoutUrl) return;
    if (Platform.OS === 'web') window.open(checkoutUrl, '_blank');
    else await Linking.openURL(checkoutUrl);
  };

  const price = taskPrice != null ? parseInt(taskPrice, 10) : null;

  // ══════════════ TRẠNG THÁI THÀNH CÔNG ══════════════
  if (phase === 'success') {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
        <View style={styles.successCircle}>
          <Ionicons name="checkmark" size={56} color="#fff" />
        </View>
        <Text style={styles.successTitle}>Đặt lịch thành công!</Text>
        <Text style={styles.successBody}>
          {workerName ? `Đã xác nhận ${workerName} nhận ` : 'Đã xác nhận '}công việc
          {' "' + (taskTitle || '') + '"'} sau khi thanh toán thành công.
        </Text>
        <Text style={styles.successNote}>Tiền đang được GIỮ an toàn — chỉ chuyển cho CarePartner khi công việc hoàn thành.</Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.popToTop()}
          activeOpacity={0.85}>
          <Ionicons name="home" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Về trang chính</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ══════════════ HẾT HẠN ══════════════
  if (phase === 'expired') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="close" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>QR đã hết hạn</Text>
          <View style={{width: 40}} />
        </View>
        <View style={styles.centerContent}>
          <View style={[styles.qrBox, {justifyContent: 'center', alignItems: 'center'}]}>
            <Ionicons name="time-outline" size={56} color={COLORS.warning} />
          </View>
          <Text style={styles.expiredTitle}>Mã QR đã hết hiệu lực</Text>
          <Text style={styles.expiredBody}>
            Lựa chọn chưa được thanh toán. Bạn có thể tạo lại mã QR để giữ chỗ
            {workerName ? ` ${workerName}` : ''}, hoặc huỷ để chọn CarePartner khác.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleRecreate}
            disabled={busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Tạo lại mã QR</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleCancel}
            disabled={busy} activeOpacity={0.85}>
            <Ionicons name="close-circle-outline" size={18} color={COLORS.textSecondary} />
            <Text style={styles.secondaryBtnText}>Huỷ lựa chọn</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ══════════════ ĐANG CHỜ QUÉT ══════════════
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      {/* Header */}
      <View style={[styles.header, {paddingTop: 12}]}>
        <TouchableOpacity onPress={handleCancel} disabled={busy} style={styles.backBtn}
          accessibilityRole="button" accessibilityLabel="Đóng và huỷ lựa chọn">
          <Ionicons name="close" size={22} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Quét mã để xác nhận</Text>
        <View style={{width: 40}} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}
        contentContainerStyle={{paddingBottom: 40}}>
        {/* Task summary */}
        <View style={styles.taskCard}>
          <Ionicons name="briefcase-outline" size={20} color={COLORS.primary} />
          <View style={{flex: 1}}>
            <Text style={styles.taskTitle} numberOfLines={1}>
              {taskTitle || `Công việc #${taskId}`}
            </Text>
            {workerName ? (
              <Text style={styles.taskWorker}>CarePartner: {workerName}</Text>
            ) : null}
          </View>
          {price != null && !Number.isNaN(price) ? (
            <Text style={styles.taskPrice}>{price.toLocaleString('vi-VN')}đ</Text>
          ) : null}
        </View>

        {/* QR box + countdown */}
        <View style={styles.qrCard}>
          <View style={styles.qrBox}>
            {qrCode ? (
              <Image
                source={{uri: qrCode}}
                style={styles.qrImg}
                accessibilityLabel="Mã QR VietQR"
                testID="payos-qr-image"
              />
            ) : (
              <View style={{alignItems: 'center', padding: 12}}>
                <Ionicons name="qr-code-outline" size={72} color={COLORS.primary} />
                <Text style={styles.qrFallbackText}>
                  QR hiển thị trên trang thanh toán PayOS
                </Text>
              </View>
            )}
          </View>

          {/* Đồng hồ đếm ngược */}
          <View style={styles.countdownRow}>
            <Ionicons name="timer-outline" size={18} color={COLORS.error} />
            <Text style={styles.countdownText}>{mm}:{ss}</Text>
            <Text style={styles.countdownLabel}>còn lại để giữ chỗ</Text>
          </View>

          <Text style={styles.hintText}>
            Mở app ngân hàng → quét QR VietQR → chuyển khoản
            {price != null && !Number.isNaN(price) ? ` ${price.toLocaleString('vi-VN')}đ` : ''}.
            Đặt lịch chỉ được XÁC NHẬN sau khi thanh toán thành công.
          </Text>

          {checkoutUrl ? (
            <TouchableOpacity style={styles.linkBtn} onPress={openCheckout} activeOpacity={0.85}>
              <Ionicons name="open-outline" size={16} color={COLORS.info} />
              <Text style={styles.linkBtnText}>Mở trang thanh toán PayOS</Text>
            </TouchableOpacity>
          ) : null}

          {/* Polling indicator */}
          <View style={styles.pollRow}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.pollText}>
              Đang chờ thanh toán… (kiểm tra tự động mỗi 4s · {pollCount} lần)
            </Text>
          </View>
        </View>

        {/* Info box */}
        <View style={styles.infoBox}>
          <Ionicons name="shield-checkmark" size={18} color={COLORS.primary} />
          <Text style={styles.infoText}>
            Tiền được GIỮ qua PayOS. Không thanh toán → CarePartner KHÔNG được
            đặt, bạn có thể bấm "Huỷ" để chọn người khác hoặc để mã QR hết hạn.
          </Text>
        </View>
      </ScrollView>

      {/* Footer — Huỷ */}
      <View style={[styles.footer, {paddingBottom: 20 + insets.bottom}]}>
        <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}
          disabled={busy} activeOpacity={0.85}>
          {busy ? <ActivityIndicator color={COLORS.textSecondary} size="small" /> : (
            <>
              <Ionicons name="close-circle-outline" size={18} color={COLORS.error} />
              <Text style={styles.cancelBtnText}>Huỷ lựa chọn — chọn người khác</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background},
  centerContent: {alignItems: 'center', justifyContent: 'center', padding: 24},
  // === HEADER ===
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SIZES.md, paddingTop: 48, paddingBottom: 14,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    ...SHADOWS.small,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: {...TYPO.h4, color: COLORS.textPrimary, fontWeight: '800'},
  // === TASK CARD ===
  body: {flex: 1, padding: SIZES.md},
  taskCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: SIZES.md,
    marginBottom: 14, ...SHADOWS.cardHover,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary,
  },
  taskTitle: {...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700', flex: 1},
  taskWorker: {...TYPO.caption, color: COLORS.textSecondary, marginTop: 2},
  taskPrice: {...TYPO.h4, color: COLORS.primary, fontWeight: '900'},
  // === QR CARD ===
  qrCard: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: SIZES.md,
    marginBottom: 14, alignItems: 'center', gap: 12, ...SHADOWS.cardHover,
  },
  qrBox: {
    width: 220, height: 220, borderRadius: SIZES.radiusMd,
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center', padding: 10,
  },
  qrImg: {width: '100%', height: '100%', resizeMode: 'contain'},
  qrFallbackText: {...TYPO.caption, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8},
  countdownRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  countdownText: {fontSize: 26, fontWeight: '900', color: COLORS.error, fontVariant: ['tabular-nums']},
  countdownLabel: {...TYPO.bodySmall, color: COLORS.textSecondary},
  hintText: {...TYPO.bodySmall, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 19},
  linkBtn: {flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14},
  linkBtnText: {...TYPO.bodySmall, color: COLORS.info, fontWeight: '700'},
  pollRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2},
  pollText: {...TYPO.caption, color: COLORS.textSecondary, flex: 1},
  infoBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusMd, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  infoText: {flex: 1, ...TYPO.bodySmall, color: COLORS.primaryDark, lineHeight: 20},
  // === BUTTONS ===
  primaryBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd, height: 52,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    paddingHorizontal: 24, marginTop: 18, ...SHADOWS.large,
  },
  primaryBtnText: {color: '#fff', ...TYPO.button, fontSize: 15},
  secondaryBtn: {
    borderRadius: SIZES.radiusMd, height: 48,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    paddingHorizontal: 24, marginTop: 10, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  secondaryBtnText: {...TYPO.button, fontSize: 14, color: COLORS.textSecondary},
  cancelBtn: {
    borderRadius: SIZES.radiusMd, height: 52, borderWidth: 1.5, borderColor: COLORS.error,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface,
  },
  cancelBtnText: {...TYPO.button, fontSize: 14, color: COLORS.error},
  footer: {
    padding: 20, backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  // === SUCCESS / EXPIRED ===
  successCircle: {
    width: 104, height: 104, borderRadius: 52, backgroundColor: COLORS.success,
    justifyContent: 'center', alignItems: 'center', marginBottom: 20, ...SHADOWS.large,
  },
  successTitle: {...TYPO.h3, color: COLORS.textPrimary, fontWeight: '900', marginBottom: 10},
  successBody: {...TYPO.body, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22},
  successNote: {
    ...TYPO.caption, color: COLORS.textSecondary, textAlign: 'center',
    marginTop: 10, lineHeight: 17,
  },
  expiredTitle: {...TYPO.h4, color: COLORS.textPrimary, fontWeight: '800', marginTop: 16},
  expiredBody: {
    ...TYPO.bodySmall, color: COLORS.textSecondary, textAlign: 'center',
    marginTop: 8, lineHeight: 19,
  },
});
