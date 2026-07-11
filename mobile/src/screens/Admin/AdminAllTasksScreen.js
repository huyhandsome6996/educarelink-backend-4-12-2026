/**
 * AdminAllTasksScreen — Danh sách tất cả công việc đã đăng
 * Admin kiểm duyệt task thủ công (bổ sung cho AI moderation)
 *
 * Đồng bộ với web: admin_dashboard.html → tab 'Tất cả công việc'
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator, Modal, TextInput, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getAllTasks, moderateTask } from '../../api/admin';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

const STATUS_FILTERS = [
  { value: 'all', label: 'Tất cả', icon: 'apps' },
  { value: 'pending', label: 'Chờ AI', icon: 'time' },
  { value: 'needs_review', label: 'Cần xem', icon: 'eye' },
  { value: 'approved', label: 'Đã duyệt', icon: 'checkmark-circle' },
  { value: 'rejected', label: 'Từ chối', icon: 'close-circle' },
];

const TASK_STATUS_LABEL = {
  open: { text: 'Đang tìm', color: COLORS.warning, bg: '#FFF7ED' },
  in_progress: { text: 'Đang làm', color: COLORS.info, bg: '#DBEAFE' },
  completed: { text: 'Hoàn thành', color: COLORS.success, bg: '#DCFCE7' },
  cancelled: { text: 'Đã hủy', color: COLORS.textSecondary, bg: '#F3F4F6' },
};

const MOD_STATUS_LABEL = {
  approved: { text: '✅ Đã duyệt', color: COLORS.success, bg: '#DCFCE7' },
  admin_approved: { text: '✅ Admin duyệt', color: COLORS.success, bg: '#DCFCE7' },
  rejected: { text: '❌ Từ chối', color: COLORS.error, bg: '#FEE2E2' },
  needs_review: { text: '⚠️ Cần xem', color: '#D97706', bg: '#FEF3C7' },
  pending: { text: '⏳ Chờ AI', color: '#4F46E5', bg: '#E0E7FF' },
};

export default function AdminAllTasksScreen() {
  const navigation = useNavigation();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [rejectModal, setRejectModal] = useState({ visible: false, taskId: null });
  const [rejectReason, setRejectReason] = useState('');

  const loadTasks = useCallback(async (status = filter) => {
    try {
      setLoading(true);
      const res = await getAllTasks(status);
      setTasks(res.data || []);
    } catch (err) {
      Alert.alert('Lỗi', 'Không thể tải danh sách công việc');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    loadTasks();
  }, [filter]);

  const onRefresh = () => {
    setRefreshing(true);
    loadTasks();
  };

  const handleApprove = async (taskId) => {
    Alert.alert(
      'Duyệt công việc',
      'Bạn có chắc muốn duyệt công việc này?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Duyệt',
          onPress: async () => {
            try {
              await moderateTask(taskId, { action: 'approve_task' });
              Alert.alert('✅ Thành công', 'Đã duyệt công việc');
              loadTasks();
            } catch (err) {
              Alert.alert('Lỗi', err.response?.data?.error || 'Không thể duyệt');
            }
          }
        }
      ]
    );
  };

  const handleReject = (taskId) => {
    setRejectModal({ visible: true, taskId });
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (!rejectReason.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập lý do xóa');
      return;
    }
    try {
      await moderateTask(rejectModal.taskId, {
        action: 'reject_task',
        reason: rejectReason
      });
      setRejectModal({ visible: false, taskId: null });
      Alert.alert('✅ Thành công', 'Đã xóa công việc');
      loadTasks();
    } catch (err) {
      Alert.alert('Lỗi', err.response?.data?.error || 'Không thể xóa');
    }
  };

  const filteredTasks = tasks.filter(t => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (t.title || '').toLowerCase().includes(q) ||
           (t.parent_name || '').toLowerCase().includes(q) ||
           (t.parent_username || '').toLowerCase().includes(q);
  });

  const renderTask = ({ item }) => {
    const taskStatus = TASK_STATUS_LABEL[item.status] || { text: item.status, color: COLORS.textSecondary, bg: '#F3F4F6' };
    const modStatus = MOD_STATUS_LABEL[item.moderation_status] || MOD_STATUS_LABEL.pending;
    const hasGeofence = item.geofence_lat && item.geofence_lng;

    return (
      <View style={styles.taskCard}>
        <View style={styles.taskHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.taskTitle} numberOfLines={2}>
              {item.title} {hasGeofence ? '📍' : ''}
            </Text>
            <Text style={styles.taskDesc} numberOfLines={2}>
              {item.description}
            </Text>
          </View>
          <Text style={styles.taskPrice}>
            {parseInt(item.price || 0).toLocaleString('vi-VN')}đ
          </Text>
        </View>

        <View style={styles.taskMeta}>
          <Text style={styles.metaText}>👤 {item.parent_name || item.parent_username}</Text>
          <Text style={styles.metaText}>📂 {item.category_name || 'Khác'}</Text>
        </View>

        <View style={styles.taskMeta}>
          <Text style={styles.metaText}>📅 {item.scheduled_time ? new Date(item.scheduled_time).toLocaleDateString('vi-VN') : '—'}</Text>
          <Text style={styles.metaText}>📍 {item.location || '—'}</Text>
        </View>

        <View style={styles.badgesRow}>
          <View style={[styles.badge, { backgroundColor: taskStatus.bg }]}>
            <Text style={[styles.badgeText, { color: taskStatus.color }]}>{taskStatus.text}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: modStatus.bg }]}>
            <Text style={[styles.badgeText, { color: modStatus.color }]}>{modStatus.text}</Text>
          </View>
        </View>

        {item.moderation_verdict ? (
          <Text style={styles.verdictText} numberOfLines={3}>
            AI: {item.moderation_verdict}
          </Text>
        ) : null}

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.approveBtn]}
            onPress={() => handleApprove(item.id)}
          >
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Duyệt</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => handleReject(item.id)}
          >
            <Ionicons name="trash" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Xóa</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tất cả công việc</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <Ionicons name="search" size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchText}
            placeholder="Tìm theo tiêu đề, phụ huynh..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <View style={styles.filterRow}>
        {STATUS_FILTERS.map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterChip, filter === f.value && styles.filterChipActive]}
            onPress={() => setFilter(f.value)}
          >
            <Ionicons
              name={f.icon}
              size={13}
              color={filter === f.value ? '#fff' : COLORS.textSecondary}
            />
            <Text style={[styles.filterText, filter === f.value && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Đang tải...</Text>
        </View>
      ) : filteredTasks.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="documents-outline" size={64} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>Không có công việc</Text>
          <Text style={styles.emptyText}>
            {filter === 'all' ? 'Chưa có phụ huynh nào đăng việc' : 'Không có công việc phù hợp bộ lọc'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredTasks}
          keyExtractor={item => item.id.toString()}
          renderItem={renderTask}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}

      {/* Reject Modal */}
      <Modal
        visible={rejectModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectModal({ visible: false, taskId: null })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Xóa công việc</Text>
            <Text style={styles.modalSubtitle}>
              Nhập lý do xóa (sẽ gửi thông báo cho phụ huynh):
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="VD: Công việc vi phạm tiêu chuẩn cộng đồng..."
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setRejectModal({ visible: false, taskId: null })}
              >
                <Text style={styles.modalCancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalConfirmBtn]}
                onPress={confirmReject}
              >
                <Text style={styles.modalConfirmText}>Xóa</Text>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { ...TYPO.h4, color: COLORS.textPrimary, fontWeight: '700' },
  refreshBtn: { padding: 4 },
  searchRow: { padding: 12, backgroundColor: COLORS.surface },
  searchInput: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.background, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
  },
  searchText: { ...TYPO.body, flex: 1, color: COLORS.textPrimary },
  filterRow: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 8,
    backgroundColor: COLORS.surface, flexWrap: 'wrap',
  },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { ...TYPO.caption, color: COLORS.textSecondary, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  list: { padding: 12, gap: 12 },
  taskCard: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 14,
    ...SHADOWS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  taskHeader: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  taskTitle: { ...TYPO.body, fontWeight: '700', color: COLORS.textPrimary, flex: 1 },
  taskDesc: { ...TYPO.caption, color: COLORS.textSecondary, marginTop: 2 },
  taskPrice: { ...TYPO.body, fontWeight: '800', color: COLORS.primary },
  taskMeta: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  metaText: { ...TYPO.caption, color: COLORS.textSecondary },
  badgesRow: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  verdictText: {
    fontSize: 11, color: COLORS.textMuted, marginTop: 6,
    fontStyle: 'italic', lineHeight: 16,
  },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, borderRadius: 8,
  },
  approveBtn: { backgroundColor: COLORS.success },
  rejectBtn: { backgroundColor: COLORS.error },
  actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { ...TYPO.body, color: COLORS.textSecondary, marginTop: 8 },
  emptyTitle: { ...TYPO.h4, color: COLORS.textPrimary, marginTop: 12 },
  emptyText: { ...TYPO.body, color: COLORS.textSecondary, textAlign: 'center', marginTop: 4 },
  modalOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)', padding: 24,
  },
  modalContent: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 20,
    width: '100%', maxWidth: 400,
  },
  modalTitle: { ...TYPO.h4, color: COLORS.textPrimary, fontWeight: '700', marginBottom: 8 },
  modalSubtitle: { ...TYPO.bodySmall, color: COLORS.textSecondary, marginBottom: 12 },
  modalInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    padding: 10, minHeight: 80, ...TYPO.body, color: COLORS.textPrimary,
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 8 },
  modalBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  modalCancelBtn: { backgroundColor: COLORS.background },
  modalCancelText: { ...TYPO.body, color: COLORS.textSecondary, fontWeight: '600' },
  modalConfirmBtn: { backgroundColor: COLORS.error },
  modalConfirmText: { ...TYPO.body, color: '#fff', fontWeight: '700' },
});
