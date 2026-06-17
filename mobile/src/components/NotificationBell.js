// ====================================================================
// NotificationBell — icon chuông thông báo hiển thị trên header
// • Hiện badge đỏ với số lượng chưa đọc khi > 0
// • Khi nhấn → mở slide-down panel (Modal) hiện danh sách thông báo
// • Poll /api/notifications/unread-count/ mỗi 30 giây
// • Gọi markNotificationsRead khi user mở panel
// • Nút "Xem tất cả" mở NotificationsScreen (full-screen)
// ====================================================================
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, FlatList,
  ActivityIndicator, RefreshControl, Animated, Platform, Image
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getNotifications, getUnreadCount, markNotificationsRead } from '../api/notifications';
import { COLORS, SHADOWS, SIZES, TYPO } from '../theme/colors';

// Helper: quy đổi timestamp sang "x phút trước" tiếng Việt
function relativeTime(iso) {
  if (!iso) return '';
  const now = new Date();
  const then = new Date(iso);
  const diffMs = now - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'Vừa xong';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'Hôm qua';
  if (day < 7) return `${day} ngày trước`;
  return then.toLocaleDateString('vi-VN');
}

export default function NotificationBell({ dark = false, size = 22, color, style }) {
  const navigation = useNavigation();
  const [unread, setUnread] = useState(0);
  const [panelVisible, setPanelVisible] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Resolve icon color: explicit color prop > dark mode > default white
  const iconColor = color || (dark ? COLORS.textPrimary : 'rgba(255,255,255,0.95)');

  // Animation: badge pop khi có thông báo mới
  const badgeScale = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-300)).current;

  // Lấy số lượng thông báo chưa đọc
  const fetchUnread = useCallback(async () => {
    try {
      const res = await getUnreadCount();
      const count = res.data?.unread_count ?? res.data?.count ?? 0;
      setUnread((prev) => {
        if (count !== prev) {
          // Hiệu ứng pop khi số lượng thay đổi
          Animated.sequence([
            Animated.spring(badgeScale, { toValue: 1.2, tension: 80, friction: 4, useNativeDriver: true }),
            Animated.spring(badgeScale, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }),
          ]).start();
        }
        return count;
      });
    } catch (e) {
      // Lỗi âm thầm — không phá vỡ UX
    }
  }, []);

  // Poll mỗi 30 giây
  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  // Mở panel + load danh sách + đánh dấu đã đọc
  const openPanel = async () => {
    setPanelVisible(true);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
    await fetchNotifications();
    // Đánh dấu đã đọc tất cả (nếu có thông báo chưa đọc)
    if (unread > 0) {
      try {
        await markNotificationsRead({ mark_all: true });
        setUnread(0);
      } catch (e) {}
    }
  };

  const closePanel = () => {
    Animated.timing(slideAnim, {
      toValue: -400,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setPanelVisible(false));
  };

  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const res = await getNotifications();
      // Sắp xếp mới nhất lên đầu + giới hạn 20 để perf tốt hơn
      const list = (res.data || []).slice().sort((a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
      ).slice(0, 20);
      setNotifications(list);
    } catch (e) {
      // Bỏ qua lỗi
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  // Đánh dấu 1 thông báo đã đọc khi tap vào
  const handleTapNotif = async (item) => {
    if (!item.is_read) {
      try {
        await markNotificationsRead({ notification_ids: [item.id] });
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
        );
      } catch (e) {}
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.notifItem, !item.is_read && styles.notifItemUnread]}
      onPress={() => handleTapNotif(item)}
      activeOpacity={0.7}
    >
      {!item.is_read && <View style={styles.unreadDot} />}
      <View style={styles.notifIconCircle}>
        <Ionicons name="notifications" size={16} color={COLORS.primary} />
      </View>
      <View style={styles.notifBody}>
        <Text style={styles.notifTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.notifMsg} numberOfLines={2}>{item.message}</Text>
        <Text style={styles.notifTime}>{relativeTime(item.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <>
      <TouchableOpacity
        style={[styles.bellBtn, dark && styles.bellBtnDark, style]}
        onPress={openPanel}
        activeOpacity={0.7}
      >
        <Ionicons
          name={unread > 0 ? 'notifications' : 'notifications-outline'}
          size={size}
          color={iconColor}
        />
        {unread > 0 && (
          <Animated.View style={[styles.badge, { transform: [{ scale: badgeScale }] }]}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </Animated.View>
        )}
      </TouchableOpacity>

      {/* Slide-down panel */}
      <Modal visible={panelVisible} transparent animationType="none" onRequestClose={closePanel}>
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.overlayTouchable} onPress={closePanel} activeOpacity={1} />
          <Animated.View style={[styles.panel, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.panelHeader}>
              <View style={styles.panelHandle} />
              <View style={styles.panelHeaderRow}>
                <View style={styles.panelTitleRow}>
                  <Ionicons name="notifications" size={20} color={COLORS.primary} />
                  <Text style={styles.panelTitle}>Thông báo</Text>
                  {unread > 0 && (
                    <View style={styles.panelBadge}>
                      <Text style={styles.panelBadgeText}>{unread > 9 ? '9+' : unread}</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity onPress={closePanel} style={styles.closeBtn}>
                  <Ionicons name="close" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {isLoading ? (
              <ActivityIndicator color={COLORS.primary} style={{ padding: 30 }} />
            ) : (
              <FlatList
                data={notifications}
                keyExtractor={(i) => i.id.toString()}
                renderItem={renderItem}
                contentContainerStyle={styles.notifList}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
                }
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <View style={styles.emptyIconCircle}>
                      <Ionicons name="notifications-off-outline" size={36} color={COLORS.textMuted} />
                    </View>
                    <Text style={styles.emptyTitle}>Chưa có thông báo</Text>
                    <Text style={styles.emptyText}>Các thông báo mới sẽ xuất hiện tại đây</Text>
                  </View>
                }
              />
            )}

            {notifications.length > 0 && (
              <TouchableOpacity
                style={styles.seeAllBtn}
                onPress={() => {
                  closePanel();
                  navigation.navigate('Notifications');
                }}
              >
                <Text style={styles.seeAllText}>Xem tất cả thông báo</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            )}
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellBtnDark: {
    backgroundColor: COLORS.background,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.error,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: COLORS.primary,
    ...SHADOWS.small,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  // === PANEL ===
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  overlayTouchable: {
    flex: 1,
  },
  panel: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: SIZES.radiusXl,
    borderTopRightRadius: SIZES.radiusXl,
    maxHeight: '80%',
    ...SHADOWS.large,
  },
  panelHeader: {
    paddingTop: 12,
    paddingHorizontal: SIZES.md,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  panelHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.divider,
    alignSelf: 'center',
    marginBottom: 12,
  },
  panelHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panelTitle: {
    ...TYPO.h4,
    color: COLORS.textPrimary,
  },
  panelBadge: {
    backgroundColor: COLORS.error,
    borderRadius: SIZES.radiusFull,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  panelBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifList: {
    padding: SIZES.md,
    gap: 10,
  },
  notifItem: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: SIZES.radiusMd,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  notifItemUnread: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primarySoft,
  },
  unreadDot: {
    position: 'absolute',
    top: 16,
    right: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  notifIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
  },
  notifBody: {
    flex: 1,
    gap: 4,
  },
  notifTitle: {
    ...TYPO.h5,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  notifMsg: {
    ...TYPO.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  notifTime: {
    ...TYPO.caption,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  emptyTitle: {
    ...TYPO.h5,
    color: COLORS.textPrimary,
  },
  emptyText: {
    ...TYPO.bodySmall,
    color: COLORS.textMuted,
  },
  seeAllBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  seeAllText: {
    ...TYPO.buttonSmall,
    color: COLORS.primary,
  },
});
