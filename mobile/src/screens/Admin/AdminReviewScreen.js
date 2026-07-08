import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput, ScrollView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  getPendingCredentials, reviewCredential,
  getPendingProfileChanges, reviewProfileChange,
} from '../../api/admin';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

// ====================================================================
// Admin Review Screen — gộp 2 tab:
//   1. Credential submissions (worker gửi by cấp)
//   2. Profile change requests (worker yêu cầu sửa hồ sơ)
// Đồng bộ với web (admin_dashboard.html phần credential + profile change)
// ====================================================================

const STATUS_LABELS = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Bị từ chối',
};

const STATUS_COLORS = {
  pending: COLORS.warning,
  approved: COLORS.success,
  rejected: COLORS.error,
};

export default function AdminReviewScreen() {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('credentials'); // credentials | profile_changes
  const [statusFilter, setStatusFilter] = useState('pending');
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [reviewModal, setReviewModal] = useState(null); // { type, item }

  const fetchData = async () => {
    try {
      let res;
      if (activeTab === 'credentials') {
        res = await getPendingCredentials(statusFilter);
      } else {
        res = await getPendingProfileChanges(statusFilter);
      }
      setData(res.data || []);
    } catch (e) {
      console.error('Admin review fetch error:', e);
      Alert.alert('Lỗi', 'Không tải được dữ liệu.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, [activeTab, statusFilter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [activeTab, statusFilter]);

  const handleReview = async (item, action) => {
    setActionLoading(`${item.id}-${action}`);
    try {
      const adminReview = reviewModal?.adminNote || '';
      if (activeTab === 'credentials') {
        // Backend chấp nhận action='approve'|'reject' + admin_review + qualifications (tuỳ chọn)
        await reviewCredential(item.id, { action, admin_review: adminReview });
      } else {
        await reviewProfileChange(item.id, { action, admin_review: adminReview });
      }
      Alert.alert('✅ Thành công', action === 'approve' ? 'Đã duyệt.' : 'Đã từ chối.');
      setReviewModal(null);
      fetchData();
    } catch (e) {
      Alert.alert('Lỗi', e.response?.data?.error || 'Thao tác thất bại.');
    } finally {
      setActionLoading(null);
    }
  };

  const openReviewModal = (item, action) => {
    setReviewModal({ type: action, item, adminNote: '' });
  };

  const renderCredential = ({ item }) => {
    const statusColor = STATUS_COLORS[item.status] || COLORS.textMuted;
    const isUpgrade = (item.description || '').includes('[NÂNG CẤP]');
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.userInfo}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.worker_username?.[0]?.toUpperCase() || '?'}</Text>
            </View>
            <View>
              <Text style={styles.workerName}>{item.worker_name}</Text>
              <Text style={styles.workerUsername}>@{item.worker_username}</Text>
            </View>
          </View>
          {isUpgrade && (
            <View style={styles.upgradeBadge}>
              <Ionicons name="arrow-up-circle" size={12} color="#fff" />
              <Text style={styles.upgradeText}>NÂNG CẤP</Text>
            </View>
          )}
        </View>

        {item.description && (
          <View style={styles.descBox}>
            <Text style={styles.descLabel}>Mô tả:</Text>
            <Text style={styles.descText}>{item.description}</Text>
          </View>
        )}

        {item.certificate_photo && (
          <View style={styles.photoBox}>
            <Text style={styles.photoLabel}>📸 Ảnh bằng cấp:</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('ImagePreview', { uri: item.certificate_photo, title: `Bằng cấp - ${item.worker_name}` })}
              activeOpacity={0.85}
            >
              <Image source={{ uri: item.certificate_photo }} style={styles.certImage} resizeMode="contain" />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.statusBar}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABELS[item.status] || item.status}</Text>
          </View>
          <Text style={styles.timeText}>{item.created_at}</Text>
        </View>

        {item.status === 'pending' && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.approveBtn, actionLoading === `${item.id}-approve` && { opacity: 0.6 }]}
              onPress={() => openReviewModal(item, 'approve')}
              disabled={actionLoading === `${item.id}-approve`}
              activeOpacity={0.85}
            >
              {actionLoading === `${item.id}-approve` ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>Duyệt</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() => openReviewModal(item, 'reject')}
              activeOpacity={0.85}
            >
              <Ionicons name="close" size={16} color={COLORS.error} />
              <Text style={[styles.actionBtnText, { color: COLORS.error }]}>Từ chối</Text>
            </TouchableOpacity>
          </View>
        )}

        {item.admin_review && item.status !== 'pending' && (
          <View style={styles.reviewBox}>
            <Text style={styles.reviewLabel}>Đánh giá admin:</Text>
            <Text style={styles.reviewText}>{item.admin_review}</Text>
            {item.reviewed_at && <Text style={styles.reviewTime}>Đã duyệt: {item.reviewed_at}</Text>}
          </View>
        )}
      </View>
    );
  };

  const renderProfileChange = ({ item }) => {
    const statusColor = STATUS_COLORS[item.status] || COLORS.textMuted;
    const changes = item.proposed_changes || {};
    const changeKeys = Object.keys(changes);

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.userInfo}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.worker_username?.[0]?.toUpperCase() || '?'}</Text>
            </View>
            <View>
              <Text style={styles.workerName}>{item.worker_name}</Text>
              <Text style={styles.workerUsername}>@{item.worker_username}</Text>
            </View>
          </View>
        </View>

        <View style={styles.changesBox}>
          <Text style={styles.changesLabel}>📝 Yêu cầu thay đổi:</Text>
          {changeKeys.map(key => (
            <View key={key} style={styles.changeRow}>
              <Text style={styles.changeKey}>{key}:</Text>
              <Text style={styles.changeValue}>{String(changes[key])}</Text>
            </View>
          ))}
        </View>

        <View style={styles.statusBar}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABELS[item.status] || item.status}</Text>
          </View>
          <Text style={styles.timeText}>{item.created_at}</Text>
        </View>

        {item.status === 'pending' && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.approveBtn, actionLoading === `${item.id}-approve` && { opacity: 0.6 }]}
              onPress={() => openReviewModal(item, 'approve')}
              disabled={actionLoading === `${item.id}-approve`}
              activeOpacity={0.85}
            >
              {actionLoading === `${item.id}-approve` ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>Duyệt</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() => openReviewModal(item, 'reject')}
              activeOpacity={0.85}
            >
              <Ionicons name="close" size={16} color={COLORS.error} />
              <Text style={[styles.actionBtnText, { color: COLORS.error }]}>Từ chối</Text>
            </TouchableOpacity>
          </View>
        )}

        {item.admin_review && item.status !== 'pending' && (
          <View style={styles.reviewBox}>
            <Text style={styles.reviewLabel}>Ghi chú admin:</Text>
            <Text style={styles.reviewText}>{item.admin_review}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Duyệt hồ sơ & bằng cấp</Text>
        <Ionicons name="document-attach" size={22} color="#fff" style={{ marginRight: 8 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {[
          { key: 'credentials', label: 'Bằng cấp', icon: 'ribbon' },
          { key: 'profile_changes', label: 'Sửa hồ sơ', icon: 'create' },
        ].map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => { setActiveTab(tab.key); setIsLoading(true); }}
              activeOpacity={0.8}
            >
              <Ionicons name={tab.icon} size={14} color={isActive ? COLORS.primary : COLORS.textMuted} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Status filter */}
      <View style={styles.filterRow}>
        {['pending', 'approved', 'rejected', 'all'].map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
            onPress={() => { setStatusFilter(s); setIsLoading(true); }}
          >
            <Text style={[styles.filterText, statusFilter === s && styles.filterTextActive]}>
              {s === 'all' ? 'Tất cả' : (s === 'pending' ? 'Chờ duyệt' : (s === 'approved' ? 'Đã duyệt' : 'Từ chối'))}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} size="large" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={i => i.id.toString()}
          renderItem={activeTab === 'credentials' ? renderCredential : renderProfileChange}
          contentContainerStyle={{ padding: SIZES.md, gap: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          ListHeaderComponent={<Text style={styles.countText}>{data.length} bản ghi</Text>}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-done-outline" size={40} color={COLORS.success} />
              <Text style={styles.emptyText}>Không có bản ghi nào</Text>
            </View>
          }
        />
      )}

      {/* Review modal */}
      <Modal visible={!!reviewModal} transparent animationType="fade" onRequestClose={() => setReviewModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {reviewModal?.type === 'approve' ? '✅ Duyệt' : '❌ Từ chối'}
            </Text>
            <Text style={styles.modalHint}>
              {activeTab === 'credentials' ? 'Bằng cấp' : 'Yêu cầu sửa hồ sơ'} của{' '}
              <Text style={{ fontWeight: '700' }}>{reviewModal?.item?.worker_name}</Text>
            </Text>
            <Text style={styles.modalInputLabel}>Ghi chú admin (tuỳ chọn):</Text>
            <TextInput
              style={styles.modalInput}
              value={reviewModal?.adminNote || ''}
              onChangeText={(text) => setReviewModal({ ...reviewModal, adminNote: text })}
              placeholder="VD: Bằng cấp hợp lệ, đã xác minh."
              placeholderTextColor={COLORS.textMuted}
              multiline
              maxLength={500}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setReviewModal(null)}>
                <Text style={styles.modalCancelText}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, reviewModal?.type === 'reject' && { backgroundColor: COLORS.error }]}
                onPress={() => handleReview(reviewModal?.item, reviewModal?.type)}
                disabled={actionLoading !== null}
              >
                {actionLoading ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={styles.modalConfirmText}>
                    {reviewModal?.type === 'approve' ? 'Duyệt' : 'Từ chối'}
                  </Text>
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
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16,
    backgroundColor: COLORS.primary, gap: 10,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: SIZES.radiusSm,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { ...TYPO.h4, color: '#fff', fontWeight: '800', flex: 1 },
  tabs: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    paddingHorizontal: 16, paddingBottom: 12, gap: SIZES.xs,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: SIZES.radiusSm,
    flexDirection: 'row', justifyContent: 'center', gap: 6, backgroundColor: COLORS.background,
  },
  tabActive: { backgroundColor: COLORS.primaryLight, ...SHADOWS.small },
  tabText: { ...TYPO.buttonSmall, color: COLORS.textMuted, fontWeight: '600' },
  tabTextActive: { color: COLORS.primary, fontWeight: '800' },
  filterRow: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12,
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { ...TYPO.caption, color: COLORS.textSecondary, fontWeight: '600' },
  filterTextActive: { color: '#fff', fontWeight: '800' },
  countText: { ...TYPO.overline, color: COLORS.textMuted, marginBottom: 4 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: 14, gap: 10,
    ...SHADOWS.cardHover, borderLeftWidth: 4, borderLeftColor: COLORS.primary,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center', ...SHADOWS.small,
  },
  avatarText: { color: '#fff', ...TYPO.h5, fontWeight: '800' },
  workerName: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  workerUsername: { ...TYPO.caption, color: COLORS.textMuted },
  upgradeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.secondary, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 3,
  },
  upgradeText: { color: '#fff', ...TYPO.overline, fontWeight: '800', fontSize: 9 },
  descBox: {
    backgroundColor: COLORS.background, borderRadius: SIZES.radiusSm, padding: 10, gap: 4,
  },
  descLabel: { ...TYPO.overline, color: COLORS.textMuted, fontWeight: '700' },
  descText: { ...TYPO.bodySmall, color: COLORS.textPrimary },
  photoBox: { gap: 6 },
  photoLabel: { ...TYPO.buttonSmall, color: COLORS.textSecondary },
  certImage: {
    width: '100%', height: 180, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.background,
  },
  statusBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { ...TYPO.buttonSmall, fontWeight: '700' },
  timeText: { ...TYPO.caption, color: COLORS.textMuted },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
    borderRadius: SIZES.radiusSm, paddingVertical: 10,
  },
  approveBtn: { backgroundColor: COLORS.success, ...SHADOWS.small },
  rejectBtn: { backgroundColor: COLORS.errorBg, borderWidth: 1, borderColor: '#fecaca' },
  actionBtnText: { ...TYPO.buttonSmall, fontWeight: '700' },
  reviewBox: {
    backgroundColor: '#FFFBEB', borderRadius: SIZES.radiusSm, padding: 10, gap: 4,
    borderLeftWidth: 3, borderLeftColor: COLORS.warning,
  },
  reviewLabel: { ...TYPO.overline, color: COLORS.warning, fontWeight: '700' },
  reviewText: { ...TYPO.bodySmall, color: COLORS.textPrimary },
  reviewTime: { ...TYPO.caption, color: COLORS.textMuted, fontStyle: 'italic' },
  changesBox: {
    backgroundColor: COLORS.background, borderRadius: SIZES.radiusSm, padding: 10, gap: 4,
  },
  changesLabel: { ...TYPO.overline, color: COLORS.textMuted, fontWeight: '700', marginBottom: 4 },
  changeRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  changeKey: { ...TYPO.bodySmall, color: COLORS.textSecondary, fontWeight: '600', minWidth: 100 },
  changeValue: { ...TYPO.body, color: COLORS.primary, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { ...TYPO.body, color: COLORS.textMuted },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalContent: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusLg, padding: 20, ...SHADOWS.large,
  },
  modalTitle: { ...TYPO.h4, color: COLORS.textPrimary, marginBottom: 8 },
  modalHint: { ...TYPO.bodySmall, color: COLORS.textSecondary, marginBottom: 16 },
  modalInputLabel: { ...TYPO.buttonSmall, color: COLORS.textSecondary, marginBottom: 4 },
  modalInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radiusSm,
    paddingHorizontal: 12, paddingVertical: 10, ...TYPO.body, color: COLORS.textPrimary,
    minHeight: 80, textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 16 },
  modalCancelBtn: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.background,
  },
  modalCancelText: { ...TYPO.button, color: COLORS.textSecondary },
  modalConfirmBtn: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.success, ...SHADOWS.small,
  },
  modalConfirmText: { ...TYPO.button, color: '#fff' },
});
