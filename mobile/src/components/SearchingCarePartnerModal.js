// ============================================================
// SearchingCarePartnerModal.js — Bottom Sheet "Đang tìm CarePartner"
//
// Hiệu ứng:
// 1. Trượt từ dưới lên (Slide Up Animation) khi phụ huynh bấm Đăng việc
// 2. Chấm radar & sóng lan tỏa (Pulsing Ripple Rings) trực quan
// 3. Thông điệp trạng thái AI cập nhật theo thời gian thực:
//    - "AI đang phân tích yêu cầu ca làm..."
//    - "Đang quét cự ly GPS & lịch rảnh của 24+ CarePartner gần bạn..."
//    - "Đang xếp hạng theo thuật toán ELO tối ưu..."
// 4. Khi tìm thấy ứng viên: Hiện dấu tích xanh thành công và TỰ ĐỘNG
//    chuyển sang màn hình CandidatesList mà KHÔNG cần bấm nút Alert
// 5. Nếu có lỗi: Hiển thị thông báo thân thiện kèm nút đóng/thử lại
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../theme/colors';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SEARCH_MESSAGES = [
  'AI đang phân tích yêu cầu ca làm...',
  'Đang quét cự ly GPS & thời gian rảnh gần bạn...',
  'Đang xếp hạng CarePartner theo thuật toán ELO...',
  'Đang hoàn tất danh sách ứng viên xuất sắc nhất...',
];

export default function SearchingCarePartnerModal({
  visible,
  status = 'searching', // 'searching' | 'success' | 'error'
  serviceType = 'Gia sư & Kèm học 1:1',
  serviceIcon = 'school',
  errorMessage = '',
  onClose,
}) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeBackdrop = useRef(new Animated.Value(0)).current;

  // Radar Pulse Rings Animations (3 vòng lan tỏa)
  const ring1Scale = useRef(new Animated.Value(0.8)).current;
  const ring1Opacity = useRef(new Animated.Value(0.8)).current;

  const ring2Scale = useRef(new Animated.Value(0.8)).current;
  const ring2Opacity = useRef(new Animated.Value(0.8)).current;

  const ring3Scale = useRef(new Animated.Value(0.8)).current;
  const ring3Opacity = useRef(new Animated.Value(0.8)).current;

  // Success Pop Animation
  const successScale = useRef(new Animated.Value(0)).current;

  const [messageIndex, setMessageIndex] = useState(0);

  // Hiệu ứng Mở / Đóng Bottom Sheet
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeBackdrop, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 22,
          stiffness: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeBackdrop, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeBackdrop, slideAnim]);

  // Luân chuyển thông điệp tìm kiếm
  useEffect(() => {
    if (!visible || status !== 'searching') return;
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % SEARCH_MESSAGES.length);
    }, 1400);
    return () => clearInterval(interval);
  }, [visible, status]);

  // Radar Rings Loop Animation
  useEffect(() => {
    if (!visible || status !== 'searching') return;

    const createRingAnimation = (scale, opacity, delay) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(scale, {
              toValue: 2.2,
              duration: 1600,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 1600,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(scale, {
              toValue: 0.8,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0.8,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
    };

    const anim1 = createRingAnimation(ring1Scale, ring1Opacity, 0);
    const anim2 = createRingAnimation(ring2Scale, ring2Opacity, 450);
    const anim3 = createRingAnimation(ring3Scale, ring3Opacity, 900);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [visible, status, ring1Scale, ring1Opacity, ring2Scale, ring2Opacity, ring3Scale, ring3Opacity]);

  // Success Pop Animation khi tìm được người
  useEffect(() => {
    if (status === 'success') {
      Animated.spring(successScale, {
        toValue: 1,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }).start();
    } else {
      successScale.setValue(0);
    }
  }, [status, successScale]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.overlay}>
        {/* Backdrop bán trong suốt */}
        <Animated.View style={[styles.backdrop, { opacity: fadeBackdrop }]} />

        {/* Bottom Sheet Card */}
        <Animated.View
          style={[
            styles.sheetContainer,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Thanh kéo trang trí */}
          <View style={styles.dragHandle} />

          {/* Header trạng thái */}
          <View style={styles.header}>
            <View style={styles.servicePill}>
              <Ionicons name={serviceIcon} size={13} color="#F26522" style={{ marginRight: 4 }} />
              <Text style={styles.servicePillText}>{serviceType}</Text>
            </View>
            <Text style={styles.title}>
              {status === 'searching' && 'Đang tìm kiếm CarePartner...'}
              {status === 'success' && 'Đã tìm thấy ứng viên xuất sắc! 🎉'}
              {status === 'error' && 'Chưa thể đăng việc'}
            </Text>
          </View>

          {/* Radar Scanner Animation hoặc Success Banner */}
          <View style={styles.centerArea}>
            {status === 'searching' && (
              <View style={styles.radarWrapper}>
                {/* 3 vòng sóng lan tỏa */}
                <Animated.View
                  style={[
                    styles.radarRing,
                    {
                      transform: [{ scale: ring1Scale }],
                      opacity: ring1Opacity,
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.radarRing,
                    {
                      transform: [{ scale: ring2Scale }],
                      opacity: ring2Opacity,
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.radarRing,
                    {
                      transform: [{ scale: ring3Scale }],
                      opacity: ring3Opacity,
                    },
                  ]}
                />

                {/* Chấm tròn tâm cam thương hiệu */}
                <View style={styles.radarCore}>
                  <Ionicons name="search" size={26} color="#FFFFFF" />
                </View>
              </View>
            )}

            {status === 'success' && (
              <Animated.View
                style={[
                  styles.successWrapper,
                  { transform: [{ scale: successScale }] },
                ]}
              >
                <View style={styles.successCircle}>
                  <Ionicons name="checkmark" size={38} color="#FFFFFF" />
                </View>
              </Animated.View>
            )}

            {status === 'error' && (
              <View style={styles.errorCircle}>
                <Ionicons name="alert" size={36} color="#FFFFFF" />
              </View>
            )}
          </View>

          {/* Thông điệp động */}
          <View style={styles.messageBox}>
            {status === 'searching' && (
              <>
                <Text style={styles.statusMessage} numberOfLines={1}>
                  {SEARCH_MESSAGES[messageIndex]}
                </Text>
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#F26522" />
                  <Text style={styles.subtext}>
                    Thuật toán ELO đang đối soát cự ly và hồ sơ sinh viên
                  </Text>
                </View>
              </>
            )}

            {status === 'success' && (
              <>
                <Text style={styles.successTitle}>Đã chọn lọc các ứng viên phù hợp nhất</Text>
                <Text style={styles.successSubtext}>
                  Đang lập tức chuyển tiếp đến danh sách ứng viên...
                </Text>
              </>
            )}

            {status === 'error' && (
              <>
                <Text style={styles.errorTitle}>Đã có lỗi xảy ra</Text>
                <Text style={styles.errorSubtext}>
                  {errorMessage || 'Không thể kết nối với máy chủ. Vui lòng thử lại.'}
                </Text>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={onClose}
                  activeOpacity={0.85}
                >
                  <Text style={styles.closeBtnText}>Đóng &amp; Kiểm tra lại</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Trust Guarantees Footer */}
          {status !== 'error' && (
            <View style={styles.footerGuarantees}>
              <View style={styles.guaranteeItem}>
                <Ionicons name="shield-checkmark" size={13} color="#059669" style={{ marginRight: 4 }} />
                <Text style={styles.guaranteeText}>Bảo lãnh MoMo Escrow</Text>
              </View>
              <View style={styles.dotSeparator} />
              <View style={styles.guaranteeItem}>
                <Ionicons name="checkmark-done" size={13} color="#2563EB" style={{ marginRight: 4 }} />
                <Text style={styles.guaranteeText}>100% đã xác thực CCCD &amp; Thẻ SV</Text>
              </View>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.65)', // Dark blur slate
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 32,
    alignItems: 'center',
    ...SHADOWS.large,
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#E2E8F0',
    marginBottom: 14,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  servicePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 999,
    marginBottom: 6,
  },
  servicePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#EA580C',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  centerArea: {
    height: 140,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
  },
  radarWrapper: {
    width: 130,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  radarRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#F26522',
    backgroundColor: 'rgba(242, 101, 34, 0.08)',
  },
  radarCore: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F26522',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.medium,
    zIndex: 10,
  },
  successWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.medium,
  },
  errorCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.medium,
  },
  messageBox: {
    alignItems: 'center',
    minHeight: 60,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  statusMessage: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 6,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subtext: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
  },
  successTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#059669',
    textAlign: 'center',
  },
  successSubtext: {
    fontSize: 12,
    color: '#475569',
    marginTop: 4,
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#DC2626',
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 16,
  },
  closeBtn: {
    marginTop: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  closeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  footerGuarantees: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 16,
    gap: 8,
  },
  guaranteeItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  guaranteeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#475569',
  },
  dotSeparator: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#CBD5E1',
  },
});
