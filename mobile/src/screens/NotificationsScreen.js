// ====================================================================
// NotificationsScreen — màn hình full-screen hiển thị toàn bộ thông báo
// • Hiển thị danh sách đầy đủ (FlatList với pull-to-refresh)
// • Tap 1 thông báo để đánh dấu đã đọc
// • Nút "Đánh dấu tất cả đã đọc" ở header
// • Relative time: "2 phút trước", "1 giờ trước", "Hôm qua"
// ====================================================================
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl, Alert, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getNotifications, markNotificationsRead } from '../api/notifications';
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

export default function NotificationsScreen() {
  const navigation = useNavigation();
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await getNotifications();
      // Sắp xếp mới nhất lên đầu
      const list = (res.data || []).slice().sort((a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
      );
      setNotifications(list);
    } catch (e) {
      console.error('Lỗi tải thông báo:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const handleTapNotif = async (item) => {
    if (item.is_read) return;
    try {
      await markNotificationsRead({ notification_ids: [item.id] });
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
      );
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể đánh dấu đã đọc. Vui lòng thử lại.');
    }
  };

  const handleMarkAllRead = async () => {
    const unreadItems = notifications.filter((n) => !n.is_read);
    if (unreadItems.length === 0) {
      Alert.alert('Thông báo', 'Không có thông báo chưa đọc.');
      return;
    }
    setMarkingAll(true);
    try {
      await markNotificationsRead({ mark_all: true });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      Alert.alert('✅ Thành công', 'Đã đánh dấu tất cả thông báo là đã đọc.');
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể đánh dấu đã đọc. Vui lòng thử lại.');
    } finally {
      setMarkingAll(false);
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
        <Ionicons name="notifications" size={18} color={COLORS.primary} />
      </View>
      <View style={styles.notifBody}>
        <View style={styles.notifTitleRow}>
          <Text style={styles.notifTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.notifTime}>{relativeTime(item.created_at)}</Text>
        </View>
        <Text style={styles.notifMsg}>{item.message}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      {/* Header cam */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Thông báo</Text>
          <TouchableOpacity
            onPress={handleMarkAllRead}
            style={styles.headerIconBtn}
            disabled={markingAll}
          >
            {markingAll ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="checkmark-done-outline" size={22} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(i) => i.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="notifications-off-outline" size={40} color={COLORS.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>Chưa có thông báo</Text>
              <Text style={styles.emptyText}>Các thông báo mới sẽ xuất hiện tại đây</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: 56,
    paddingBottom: 18,
    paddingHorizontal: 20,
    borderBottomLeftRadius: SIZES.radiusLg,
    borderBottomRightRadius: SIZES.radiusLg,
    ...SHADOWS.large,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...TYPO.h3,
    color: '#fff',
    fontWeight: '800',
  },
  list: { padding: SIZES.md, gap: 10 },
  notifItem: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: SIZES.radiusMd,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  notifItemUnread: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primarySoft,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
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
    width: 40,
    height: 40,
    borderRadius: 20,
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
  notifTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  notifTitle: {
    ...TYPO.h5,
    color: COLORS.textPrimary,
    fontWeight: '700',
    flex: 1,
  },
  notifTime: {
    ...TYPO.caption,
    color: COLORS.textMuted,
  },
  notifMsg: {
    ...TYPO.body,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  emptyTitle: {
    ...TYPO.h4,
    color: COLORS.textPrimary,
  },
  emptyText: {
    ...TYPO.bodySmall,
    color: COLORS.textMuted,
  },
});
