import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl, Alert, ScrollView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getMyComplaints } from '../../api/moderation';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

// ====================================================================
// Worker My Complaints Screen — đồng bộ với web (worker_profile.html phần khiếu nại)
// List khiếu nại mà worker đã gửi + status (pending/resolved/dismissed)
// ====================================================================

const COMPLAINT_TYPE_LABELS = {
  exploitation: 'Bóc lột',
  abuse: 'Ngược đãi',
  harassment: 'Quấy rối',
  non_payment: 'Không trả tiền',
  fraud: 'Gian lận',
  unsafe: 'Không an toàn',
  other: 'Khác',
};

const STATUS_LABELS = {
  pending: 'Chờ xử lý',
  investigating: 'Đang điều tra',
  resolved: 'Đã giải quyết',
  dismissed: 'Bị bác bỏ',
};

const STATUS_COLORS = {
  pending: COLORS.warning,
  investigating: COLORS.info,
  resolved: COLORS.success,
  dismissed: COLORS.textMuted,
};

const PRIORITY_LABELS = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  urgent: 'Khẩn cấp',
};

export default function MyComplaintsScreen() {
  const navigation = useNavigation();
  const [complaints, setComplaints] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const res = await getMyComplaints();
      setComplaints(res.data || []);
    } catch (e) {
      console.error('getMyComplaints error:', e);
      Alert.alert('Lỗi', 'Không tải được danh sách khiếu nại.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, []);

  const renderItem = ({ item }) => {
    const statusColor = STATUS_COLORS[item.status] || COLORS.textMuted;
    const priorityColor = item.priority === 'urgent' ? COLORS.error :
                          item.priority === 'high' ? COLORS.warning :
                          item.priority === 'medium' ? COLORS.info : COLORS.textMuted;

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.typeBadge}>
            <Ionicons name="alert-circle" size={14} color={COLORS.error} />
            <Text style={styles.typeText}>{COMPLAINT_TYPE_LABELS[item.complaint_type] || item.complaint_type}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABELS[item.status] || item.status}</Text>
          </View>
        </View>

        <Text style={styles.complaintTitle}>{item.title}</Text>
        <Text style={styles.complaintDesc} numberOfLines={3}>{item.description}</Text>

        {item.task_title && (
          <View style={styles.taskRow}>
            <Ionicons name="briefcase-outline" size={12} color={COLORS.textMuted} />
            <Text style={styles.taskText}>{item.task_title}</Text>
          </View>
        )}

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Ưu tiên:</Text>
            <Text style={[styles.metaValue, { color: priorityColor, fontWeight: '700' }]}>
              {PRIORITY_LABELS[item.priority] || item.priority}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Người bị KN:</Text>
            <Text style={styles.metaValue}>@{item.reported_user_name}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Bằng chứng:</Text>
            <Text style={styles.metaValue}>{item.evidence?.length || 0} file</Text>
          </View>
        </View>

        {/* AI Analysis (nếu có) */}
        {item.ai_analysis && (
          <View style={styles.aiBox}>
            <View style={styles.aiHeader}>
              <Ionicons name="sparkles" size={14} color={COLORS.primary} />
              <Text style={styles.aiLabel}>AI phân tích</Text>
            </View>
            <Text style={styles.aiText}>{item.ai_analysis}</Text>
            {item.ai_suggestion && (
              <View style={styles.aiSuggestionBox}>
                <Text style={styles.aiSuggestionLabel}>💡 Gợi ý AI:</Text>
                <Text style={styles.aiSuggestionText}>{item.ai_suggestion}</Text>
              </View>
            )}
          </View>
        )}

        {/* Admin response */}
        {item.admin_response && (
          <View style={styles.adminBox}>
            <View style={styles.adminHeader}>
              <Ionicons name="shield-checkmark" size={14} color={COLORS.success} />
              <Text style={styles.adminLabel}>Phản hồi admin</Text>
            </View>
            <Text style={styles.adminText}>{item.admin_response}</Text>
            {item.resolved_at && (
              <Text style={styles.adminTime}>Xử lý lúc: {item.resolved_at?.replace('T', ' ').slice(0, 19)}</Text>
            )}
          </View>
        )}

        {/* Evidence */}
        {item.evidence && item.evidence.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.evidenceRow}>
            {item.evidence.map(ev => (
              <TouchableOpacity
                key={ev.id}
                onPress={() => navigation.navigate('ImagePreview', { uri: ev.file, title: `Bằng chứng #${ev.id}` })}
              >
                {ev.evidence_type === 'image' ? (
                  <Image source={{ uri: ev.file }} style={styles.evidenceThumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.evidenceThumb, styles.evidenceFile]}>
                    <Ionicons name={ev.evidence_type === 'video' ? 'videocam' : 'document'} size={20} color={COLORS.primary} />
                    <Text style={styles.evidenceFileText}>{ev.evidence_type}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <Text style={styles.createdAt}>Gửi lúc: {item.created_at?.replace('T', ' ').slice(0, 19)}</Text>
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
        <Text style={styles.headerTitle}>Khiếu nại của tôi</Text>
        <Ionicons name="documents" size={22} color="#fff" style={{ marginRight: 8 }} />
      </View>

      <View style={styles.actionBar}>
        <TouchableOpacity
          style={styles.newComplaintBtn}
          onPress={() => navigation.navigate('Complaint')}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={styles.newComplaintText}>Tạo khiếu nại mới</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} size="large" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={complaints}
          keyExtractor={i => i.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ padding: SIZES.md, gap: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          ListHeaderComponent={<Text style={styles.countText}>{complaints.length} khiếu nại</Text>}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="documents-outline" size={40} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>Chưa có khiếu nại</Text>
              <Text style={styles.emptyText}>
                Nếu bạn gặp vấn đề với phụ huynh, hãy tạo khiếu nại để admin hỗ trợ.
              </Text>
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
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16,
    backgroundColor: COLORS.primary, gap: 10,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: SIZES.radiusSm,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { ...TYPO.h4, color: '#fff', fontWeight: '800', flex: 1 },
  actionBar: {
    backgroundColor: COLORS.surface, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  newComplaintBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd, paddingVertical: 12, ...SHADOWS.small,
  },
  newComplaintText: { color: '#fff', ...TYPO.button },
  countText: { ...TYPO.overline, color: COLORS.textMuted, marginBottom: 4 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: 14, gap: 10,
    borderLeftWidth: 4, borderLeftColor: COLORS.error, ...SHADOWS.cardHover,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.errorBg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  typeText: { color: COLORS.error, ...TYPO.overline, fontWeight: '800', fontSize: 10 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { ...TYPO.buttonSmall, fontWeight: '700' },
  complaintTitle: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  complaintDesc: { ...TYPO.bodySmall, color: COLORS.textSecondary, lineHeight: 20 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  taskText: { ...TYPO.caption, color: COLORS.textMuted },
  metaRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  metaItem: { gap: 2 },
  metaLabel: { ...TYPO.overline, color: COLORS.textMuted, fontWeight: '600' },
  metaValue: { ...TYPO.bodySmall, color: COLORS.textPrimary },
  aiBox: {
    backgroundColor: '#EFF6FF', borderRadius: SIZES.radiusSm, padding: 10, gap: 6,
    borderLeftWidth: 3, borderLeftColor: COLORS.info,
  },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  aiLabel: { ...TYPO.buttonSmall, color: COLORS.info, fontWeight: '700' },
  aiText: { ...TYPO.bodySmall, color: COLORS.textPrimary },
  aiSuggestionBox: {
    backgroundColor: '#FFFBEB', borderRadius: 6, padding: 8, marginTop: 4, gap: 2,
  },
  aiSuggestionLabel: { ...TYPO.overline, color: COLORS.warning, fontWeight: '700' },
  aiSuggestionText: { ...TYPO.bodySmall, color: COLORS.textPrimary },
  adminBox: {
    backgroundColor: '#ECFDF5', borderRadius: SIZES.radiusSm, padding: 10, gap: 4,
    borderLeftWidth: 3, borderLeftColor: COLORS.success,
  },
  adminHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  adminLabel: { ...TYPO.buttonSmall, color: COLORS.success, fontWeight: '700' },
  adminText: { ...TYPO.bodySmall, color: COLORS.textPrimary },
  adminTime: { ...TYPO.caption, color: COLORS.textMuted, fontStyle: 'italic' },
  evidenceRow: { flexDirection: 'row', gap: 8 },
  evidenceThumb: {
    width: 80, height: 80, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.background,
  },
  evidenceFile: {
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, gap: 4,
  },
  evidenceFileText: { ...TYPO.caption, color: COLORS.primary, fontWeight: '700' },
  createdAt: { ...TYPO.caption, color: COLORS.textMuted, fontStyle: 'italic' },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyIconCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center', ...SHADOWS.small,
  },
  emptyTitle: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  emptyText: { ...TYPO.bodySmall, color: COLORS.textMuted, textAlign: 'center' },
});
