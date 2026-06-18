import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl, Alert, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  getModerationQueue, overrideModeration, getComplaints,
  resolveComplaint, aiAnalyzeComplaint,
} from '../../api/moderation';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';
import NotificationBell from '../../components/NotificationBell';

const TABS = [
  { key: 'moderation', label: 'Kiểm duyệt', icon: 'shield-checkmark-outline' },
  { key: 'complaints', label: 'Khiếu nại', icon: 'alert-circle-outline' },
];

export default function AdminModerationScreen() {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('moderation');
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      if (activeTab === 'moderation') {
        const res = await getModerationQueue('needs_review');
        setData(res.data || []);
      } else {
        const res = await getComplaints('pending');
        setData(res.data || []);
      }
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); setRefreshing(false); }
  }, [activeTab]);

  useEffect(() => { setIsLoading(true); fetchData(); }, [activeTab]);

  const handleOverride = (id, status) => {
    Alert.alert(
      status === 'admin_approved' ? 'Duyệt công việc' : 'Từ chối công việc',
      status === 'admin_approved' ? 'Cho phép công việc này hiển thị?' : 'Từ chối công việc này?',
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Xác nhận', onPress: async () => {
          try { await overrideModeration(id, status); Alert.alert('✅ Đã xử lý'); fetchData(); }
          catch (e) { Alert.alert('Lỗi', 'Không thể xử lý.'); }
        }},
      ]
    );
  };

  const handleResolve = (id, status) => {
    Alert.alert(
      status === 'resolved' ? 'Giải quyết khiếu nại' : 'Bác bỏ khiếu nại',
      'Xác nhận?',
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Xác nhận', onPress: async () => {
          try { await resolveComplaint(id, { status, admin_response: '' }); Alert.alert('✅ Đã xử lý'); fetchData(); }
          catch (e) { Alert.alert('Lỗi', 'Không thể xử lý.'); }
        }},
      ]
    );
  };

  const handleAIAnalyze = async (id) => {
    try {
      await aiAnalyzeComplaint(id);
      Alert.alert('✅ AI đã phân tích xong');
      fetchData();
    } catch (e) { Alert.alert('Lỗi', 'AI không khả dụng.'); }
  };

  const renderItem = ({ item }) => {
    if (activeTab === 'moderation') {
      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.statusBadge, styles.statusNeedsReview]}>
              <Text style={styles.statusBadgeText}>Cần duyệt</Text>
            </View>
          </View>
          <Text style={styles.cardTitle}>{item.task_title || `Task #${item.task}`}</Text>
          <Text style={styles.cardDesc}>AI: {item.ai_verdict || 'Chưa có'}</Text>
          {item.ai_suggestion ? <Text style={styles.cardSuggestion}>💡 {item.ai_suggestion}</Text> : null}
          <View style={styles.cardActions}>
            <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={() => handleOverride(item.id, 'admin_approved')}>
              <Ionicons name="checkmark" size={16} color="#fff" /><Text style={styles.actionBtnTextWhite}>Duyệt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => handleOverride(item.id, 'admin_rejected')}>
              <Ionicons name="close" size={16} color={COLORS.error} /><Text style={styles.actionBtnTextRed}>Từ chối</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.statusBadge, styles.statusPending]}>
            <Text style={styles.statusBadgeText}>{item.complaint_type}</Text>
          </View>
          {item.ai_analyzed && (
            <View style={[styles.statusBadge, styles.statusAI]}>
              <Text style={styles.statusBadgeText}>AI: {item.ai_priority}</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardDesc}>{item.description?.substring(0, 100)}</Text>
        <Text style={styles.cardMeta}>Từ: {item.complainant_name} → {item.reported_user_name}</Text>
        {item.ai_analysis ? <Text style={styles.cardSuggestion}>🤖 {item.ai_analysis}</Text> : null}
        <View style={styles.cardActions}>
          {!item.ai_analyzed && (
            <TouchableOpacity style={[styles.actionBtn, styles.aiBtn]} onPress={() => handleAIAnalyze(item.id)}>
              <Ionicons name="sparkles" size={14} color={COLORS.primary} /><Text style={styles.actionBtnTextPrimary}>AI phân tích</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={() => handleResolve(item.id, 'resolved')}>
            <Ionicons name="checkmark" size={16} color="#fff" /><Text style={styles.actionBtnTextWhite}>Giải quyết</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => handleResolve(item.id, 'dismissed')}>
            <Ionicons name="close" size={16} color={COLORS.error} /><Text style={styles.actionBtnTextRed}>Bác</Text>
          </TouchableOpacity>
        </View>
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
        <Text style={styles.headerTitle}>Kiểm duyệt & Khiếu nại</Text>
        <NotificationBell color="#fff" />
      </View>
      <View style={styles.tabs}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity key={tab.key} style={[styles.tab, isActive && styles.tabActive]} onPress={() => setActiveTab(tab.key)} activeOpacity={0.8}>
              <Ionicons name={tab.icon} size={16} color={isActive ? COLORS.primary : COLORS.textMuted} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} size="large" style={{ marginTop: 60 }} />
      ) : (
        <FlatList data={data} keyExtractor={i => i.id.toString()} renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconCircle}><Ionicons name="checkmark-done-outline" size={40} color={COLORS.primary} /></View>
              <Text style={styles.emptyTitle}>Không có mục nào</Text>
              <Text style={styles.emptyText}>{activeTab === 'moderation' ? 'Tất cả task đã được duyệt' : 'Không có khiếu nại nào'}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SIZES.md, paddingTop: 56, paddingBottom: 16, backgroundColor: COLORS.primary },
  backBtn: { width: 40, height: 40, borderRadius: SIZES.radiusSm, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { ...TYPO.h4, color: '#fff', fontWeight: '800', flex: 1, marginLeft: 12 },
  tabs: { flexDirection: 'row', backgroundColor: COLORS.surface, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SIZES.xs },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: SIZES.radiusSm, flexDirection: 'row', justifyContent: 'center', gap: 6, backgroundColor: COLORS.background },
  tabActive: { backgroundColor: COLORS.primaryLight },
  tabText: { ...TYPO.buttonSmall, color: COLORS.textMuted, fontWeight: '600' },
  tabTextActive: { color: COLORS.primary, fontWeight: '800' },
  list: { padding: SIZES.md, gap: 12 },
  card: { backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: 14, gap: 8, borderLeftWidth: 4, borderLeftColor: COLORS.warning },
  cardHeader: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  statusBadge: { borderRadius: SIZES.radiusXs, paddingHorizontal: 8, paddingVertical: 3 },
  statusNeedsReview: { backgroundColor: COLORS.warningBg },
  statusPending: { backgroundColor: COLORS.errorBg },
  statusAI: { backgroundColor: COLORS.primaryLight },
  statusBadgeText: { ...TYPO.overline, fontWeight: '700', color: COLORS.textPrimary },
  cardTitle: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  cardDesc: { ...TYPO.bodySmall, color: COLORS.textSecondary, lineHeight: 18 },
  cardSuggestion: { ...TYPO.caption, color: COLORS.primary, fontStyle: 'italic', lineHeight: 16 },
  cardMeta: { ...TYPO.caption, color: COLORS.textMuted },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: { flex: 1, height: 40, borderRadius: SIZES.radiusSm, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 },
  approveBtn: { backgroundColor: COLORS.success },
  rejectBtn: { backgroundColor: COLORS.errorBg, borderWidth: 1, borderColor: '#fecaca' },
  aiBtn: { backgroundColor: COLORS.primaryLight, borderWidth: 1, borderColor: COLORS.primarySoft },
  actionBtnTextWhite: { color: '#fff', ...TYPO.buttonSmall },
  actionBtnTextRed: { color: COLORS.error, ...TYPO.buttonSmall },
  actionBtnTextPrimary: { color: COLORS.primary, ...TYPO.buttonSmall },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { ...TYPO.h4, color: COLORS.textPrimary },
  emptyText: { ...TYPO.bodySmall, color: COLORS.textMuted },
});
