import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput, ScrollView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  getPaymentOverview, getAllPayments, retryPayout,
  regenerateSettlementQR, runMonthlySettlement, getPaymentLogs,
} from '../../api/payments';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

// ====================================================================
// Admin Payments Screen — đồng bộ với web (admin_dashboard.html phần payment)
// Dashboard tổng quan + list payments + retry payout + regenerate QR
// + run monthly settlement + audit logs
// ====================================================================

const STATUS_LABELS = {
  pending: 'Chờ thanh toán',
  held: 'Đang giữ tiền',
  completed: 'Hoàn tất',
  cancelled: 'Đã huỷ',
  refunded: 'Đã hoàn tiền',
  payout_failed: 'Giải ngân thất bại',
};

const STATUS_COLORS = {
  pending: COLORS.warning,
  held: COLORS.info,
  completed: COLORS.success,
  cancelled: COLORS.textMuted,
  refunded: COLORS.info,
  payout_failed: COLORS.error,
};

const METHOD_LABELS = {
  momo_escrow: 'MoMo Escrow',
  cash: 'Tiền mặt',
};

export default function AdminPaymentsScreen() {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('overview'); // overview | payments | settlements | logs
  const [overview, setOverview] = useState(null);
  const [payments, setPayments] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [showRunSettlementModal, setShowRunSettlementModal] = useState(false);
  const [settlementYear, setSettlementYear] = useState('');
  const [settlementMonth, setSettlementMonth] = useState('');

  const fetchOverview = async () => {
    try {
      const res = await getPaymentOverview();
      setOverview(res.data);
    } catch (e) {
      console.error('fetchOverview error:', e);
    }
  };

  const fetchPayments = async () => {
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterMethod) params.method = filterMethod;
      const res = await getAllPayments(params);
      setPayments(res.data || []);
    } catch (e) {
      console.error('fetchPayments error:', e);
      Alert.alert('Lỗi', 'Không tải được danh sách thanh toán.');
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await getPaymentLogs();
      setLogs((res.data || []).slice(0, 100));
    } catch (e) {
      console.error('fetchLogs error:', e);
    }
  };

  const fetchAll = async () => {
    setIsLoading(true);
    await Promise.all([fetchOverview(), fetchPayments(), fetchLogs()]);
    setIsLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAll();
  }, []);

  const handleRetryPayout = (paymentId) => {
    Alert.alert(
      'Thử lại giải ngân',
      'Bạn có chắc muốn thử lại giải ngân cho payment này?',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Thử lại', onPress: async () => {
            setActionLoading(`retry-${paymentId}`);
            try {
              await retryPayout(paymentId);
              Alert.alert('✅ Thành công', 'Đã thử lại giải ngân.');
              fetchPayments();
              fetchOverview();
            } catch (e) {
              Alert.alert('Lỗi', e.response?.data?.error || 'Thử lại thất bại.');
            } finally {
              setActionLoading(null);
            }
          }
        },
      ]
    );
  };

  const handleRunSettlement = async () => {
    setShowRunSettlementModal(false);
    setActionLoading('settlement');
    try {
      const payload = {};
      if (settlementYear) payload.year = parseInt(settlementYear);
      if (settlementMonth) payload.month = parseInt(settlementMonth);
      const res = await runMonthlySettlement(payload);
      const stats = res.data || {};
      Alert.alert(
        '✅ Hoàn tất',
        `Đã tạo ${stats.settlements_created || 0} kỳ thanh toán.\nTổng hoa hồng: ${(stats.total_commission || 0).toLocaleString('vi-VN')}đ`
      );
      fetchOverview();
    } catch (e) {
      Alert.alert('Lỗi', e.response?.data?.error || 'Run settlement thất bại.');
    } finally {
      setActionLoading(null);
      setSettlementYear('');
      setSettlementMonth('');
    }
  };

  const formatVND = (amount) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
    return num.toLocaleString('vi-VN') + 'đ';
  };

  const renderOverview = () => {
    if (!overview) return <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />;

    return (
      <ScrollView style={styles.overviewWrap} showsVerticalScrollIndicator={false}>
        {/* MoMo status */}
        <View style={[styles.card, { borderLeftColor: overview.momo_configured ? COLORS.success : COLORS.warning }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="card" size={20} color={COLORS.primary} />
            <Text style={styles.cardTitle}>MoMo Configuration</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Trạng thái:</Text>
            <Text style={[styles.value, { color: overview.momo_configured ? COLORS.success : COLORS.warning, fontWeight: '700' }]}>
              {overview.momo_configured ? '✅ Đã cấu hình' : '⚠️ Chưa cấu hình'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Environment:</Text>
            <Text style={styles.value}>{overview.momo_sandbox ? 'Sandbox (test)' : 'Production'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Hoa hồng nền tảng:</Text>
            <Text style={styles.value}>{(overview.commission_rate ? parseFloat(overview.commission_rate) * 100 : 20)}%</Text>
          </View>
        </View>

        {/* Tổng quan payments */}
        <Text style={styles.sectionTitle}>📊 Tổng quan thanh toán</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{overview.total_payments || 0}</Text>
            <Text style={styles.statLabel}>Tổng giao dịch</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{overview.by_method?.momo_escrow || 0}</Text>
            <Text style={styles.statLabel}>MoMo Escrow</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{overview.by_method?.cash || 0}</Text>
            <Text style={styles.statLabel}>Tiền mặt</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: COLORS.errorBg }]}>
            <Text style={[styles.statValue, { color: COLORS.error }]}>{overview.pending_payouts_failed || 0}</Text>
            <Text style={styles.statLabel}>Giải ngân fail</Text>
          </View>
        </View>

        {/* Tiền */}
        <Text style={styles.sectionTitle}>💰 Dòng tiền</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>💰 Doanh thu hoa hồng:</Text>
            <Text style={[styles.value, { color: COLORS.success, fontWeight: '800' }]}>{formatVND(overview.total_revenue_commission)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>💸 Đã trả carepartner:</Text>
            <Text style={styles.value}>{formatVND(overview.total_payout_to_workers)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>🔒 Đang giữ trong escrow:</Text>
            <Text style={[styles.value, { color: COLORS.warning, fontWeight: '700' }]}>{formatVND(overview.total_held_in_escrow)}</Text>
          </View>
        </View>

        {/* Settlements */}
        <Text style={styles.sectionTitle}>📋 Kỳ thanh toán hoa hồng</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Tổng số kỳ:</Text>
            <Text style={styles.value}>{overview.settlements?.total || 0}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Đã sinh QR:</Text>
            <Text style={styles.value}>{overview.settlements?.qr_generated || 0}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Đã thanh toán:</Text>
            <Text style={[styles.value, { color: COLORS.success, fontWeight: '700' }]}>{overview.settlements?.paid || 0}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Quá hạn:</Text>
            <Text style={[styles.value, { color: COLORS.error, fontWeight: '700' }]}>{overview.settlements?.overdue || 0}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Tổng nợ đang chờ:</Text>
            <Text style={[styles.value, { color: COLORS.warning, fontWeight: '800' }]}>{formatVND(overview.settlements?.total_owed)}</Text>
          </View>
        </View>

        {/* Action: Run monthly settlement */}
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: COLORS.primary }]}
          onPress={() => setShowRunSettlementModal(true)}
          disabled={actionLoading === 'settlement'}
          activeOpacity={0.85}
        >
          {actionLoading === 'settlement' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="calendar" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Chạy monthly settlement</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  const renderPayment = ({ item }) => {
    const statusColor = STATUS_COLORS[item.status] || COLORS.textMuted;
    const canRetry = item.status === 'payout_failed';
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.methodBadge(item.method)}>
            <Ionicons name={item.method === 'momo_escrow' ? 'card' : 'cash'} size={14} color="#fff" />
            <Text style={styles.methodText}>{METHOD_LABELS[item.method]}</Text>
          </View>
          <Text style={styles.paymentId}>#{item.id}</Text>
        </View>

        <Text style={styles.taskTitle}>{item.task_title || `Task #${item.task}`}</Text>

        <View style={styles.paymentAmounts}>
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Tổng:</Text>
            <Text style={styles.amountValue}>{formatVND(item.amount)}</Text>
          </View>
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Hoa hồng:</Text>
            <Text style={[styles.amountValue, { color: COLORS.success }]}>{formatVND(item.commission_amount)}</Text>
          </View>
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Carepartner nhận:</Text>
            <Text style={[styles.amountValue, { color: COLORS.primary, fontWeight: '800' }]}>{formatVND(item.worker_payout_amount)}</Text>
          </View>
        </View>

        <View style={styles.partiesRow}>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Phụ huynh</Text>
            <Text style={styles.partyName}>{item.parent_full_name || item.parent_name}</Text>
          </View>
          <Ionicons name="arrow-forward" size={14} color={COLORS.textMuted} />
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Carepartner</Text>
            <Text style={styles.partyName}>{item.worker_full_name || item.worker_name || '(chưa có)'}</Text>
          </View>
        </View>

        <View style={styles.statusBar}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABELS[item.status] || item.status}</Text>
          </View>
          {item.momo_result_code != null && (
            <Text style={styles.momoCode}>resultCode: {item.momo_result_code}</Text>
          )}
        </View>

        {canRetry && (
          <TouchableOpacity
            style={[styles.retryBtn, actionLoading === `retry-${item.id}` && { opacity: 0.6 }]}
            onPress={() => handleRetryPayout(item.id)}
            disabled={actionLoading === `retry-${item.id}`}
            activeOpacity={0.85}
          >
            {actionLoading === `retry-${item.id}` ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="refresh" size={14} color="#fff" />
                <Text style={styles.retryBtnText}>Thử lại giải ngân</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderLog = ({ item }) => {
    const eventColor = item.event_type?.includes('failed') ? COLORS.error :
                       item.event_type?.includes('completed') || item.event_type?.includes('paid') ? COLORS.success :
                       item.event_type?.includes('created') || item.event_type?.includes('generated') ? COLORS.primary :
                       COLORS.textMuted;
    return (
      <View style={styles.logCard}>
        <View style={styles.logTop}>
          <View style={[styles.logBadge, { backgroundColor: eventColor + '20' }]}>
            <Text style={[styles.logEventText, { color: eventColor }]}>{item.event_type}</Text>
          </View>
          <Text style={styles.logTime}>{item.created_at?.replace('T', ' ').slice(0, 19) || ''}</Text>
        </View>
        {item.message && <Text style={styles.logMessage}>{item.message}</Text>}
        {(item.payment || item.settlement) && (
          <Text style={styles.logTarget}>
            {item.payment ? `Payment #${item.payment}` : `Settlement #${item.settlement}`}
            {item.actor ? ` • by ${item.actor === item.actor ? 'User#' + item.actor : 'system'}` : ' • by system'}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Quản lý Thanh toán</Text>
        <Ionicons name="card" size={22} color="#fff" style={{ marginRight: 8 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {[
          { key: 'overview', label: 'Tổng quan', icon: 'stats-chart' },
          { key: 'payments', label: 'Giao dịch', icon: 'cash' },
          { key: 'logs', label: 'Audit log', icon: 'list' },
        ].map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.8}
            >
              <Ionicons name={tab.icon} size={14} color={isActive ? COLORS.primary : COLORS.textMuted} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Filter row — chỉ hiện ở tab payments */}
      {activeTab === 'payments' && (
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, !filterStatus && styles.filterChipActive]}
            onPress={() => { setFilterStatus(''); fetchPayments(); }}
          >
            <Text style={[styles.filterText, !filterStatus && styles.filterTextActive]}>Tất cả</Text>
          </TouchableOpacity>
          {['pending', 'held', 'completed', 'payout_failed', 'refunded'].map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.filterChip, filterStatus === s && styles.filterChipActive]}
              onPress={() => { setFilterStatus(s); }}
            >
              <Text style={[styles.filterText, filterStatus === s && styles.filterTextActive]}>{STATUS_LABELS[s]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} size="large" style={{ marginTop: 60 }} />
      ) : activeTab === 'overview' ? (
        renderOverview()
      ) : (
        <FlatList
          data={activeTab === 'payments' ? payments : logs}
          keyExtractor={i => i.id.toString()}
          renderItem={activeTab === 'payments' ? renderPayment : renderLog}
          contentContainerStyle={{ padding: SIZES.md, gap: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>Không có dữ liệu</Text>
            </View>
          }
        />
      )}

      {/* Run settlement modal */}
      <Modal visible={showRunSettlementModal} transparent animationType="fade" onRequestClose={() => setShowRunSettlementModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Chạy monthly settlement</Text>
            <Text style={styles.modalHint}>
              Để trống cả 2 field = chạy cho tháng trước. Hoặc điền cụ thể năm/tháng.
            </Text>
            <View style={styles.modalInputRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalInputLabel}>Năm (vd: 2026)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={settlementYear}
                  onChangeText={setSettlementYear}
                  keyboardType="numeric"
                  placeholder="2026"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalInputLabel}>Tháng (1-12)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={settlementMonth}
                  onChangeText={setSettlementMonth}
                  keyboardType="numeric"
                  placeholder="6"
                />
              </View>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowRunSettlementModal(false)}>
                <Text style={styles.modalCancelText}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleRunSettlement}>
                <Text style={styles.modalConfirmText}>Chạy</Text>
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
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  filterChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary, borderColor: COLORS.primary,
  },
  filterText: { ...TYPO.caption, color: COLORS.textSecondary, fontWeight: '600' },
  filterTextActive: { color: '#fff', fontWeight: '800' },
  overviewWrap: { padding: SIZES.md, gap: 14 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: 16,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary, ...SHADOWS.cardHover,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  label: { ...TYPO.bodySmall, color: COLORS.textSecondary },
  value: { ...TYPO.body, color: COLORS.textPrimary, fontWeight: '600' },
  sectionTitle: { ...TYPO.h4, color: COLORS.textPrimary, marginTop: 6, marginBottom: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: {
    flex: 1, minWidth: '47%', backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    padding: 14, alignItems: 'center', ...SHADOWS.small,
  },
  statValue: { ...TYPO.h2, color: COLORS.primary, fontWeight: '800' },
  statLabel: { ...TYPO.caption, color: COLORS.textSecondary, marginTop: 4 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: SIZES.radiusMd, paddingVertical: 14, marginTop: 10, ...SHADOWS.small,
  },
  actionBtnText: { color: '#fff', ...TYPO.button, fontSize: 15 },
  // Payment card
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  methodBadge: (method) => ({
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: method === 'momo_escrow' ? '#D82D8B' : COLORS.success,
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  }),
  methodText: { color: '#fff', ...TYPO.overline, fontWeight: '800', fontSize: 10 },
  paymentId: { ...TYPO.caption, color: COLORS.textMuted },
  taskTitle: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700', marginBottom: 8 },
  paymentAmounts: {
    backgroundColor: COLORS.background, borderRadius: SIZES.radiusSm, padding: 10, gap: 4, marginBottom: 10,
  },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between' },
  amountLabel: { ...TYPO.bodySmall, color: COLORS.textSecondary },
  amountValue: { ...TYPO.body, color: COLORS.textPrimary, fontWeight: '600' },
  partiesRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.background, borderRadius: SIZES.radiusSm, padding: 10, marginBottom: 10,
  },
  partyBox: { flex: 1 },
  partyLabel: { ...TYPO.overline, color: COLORS.textMuted },
  partyName: { ...TYPO.body, color: COLORS.textPrimary, fontWeight: '600' },
  statusBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { ...TYPO.buttonSmall, fontWeight: '700' },
  momoCode: { ...TYPO.caption, color: COLORS.textMuted },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.warning, borderRadius: SIZES.radiusSm, paddingVertical: 10, marginTop: 8,
    ...SHADOWS.small,
  },
  retryBtnText: { color: '#fff', ...TYPO.buttonSmall, fontWeight: '700' },
  // Log card
  logCard: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusSm, padding: 12,
    borderLeftWidth: 3, borderLeftColor: COLORS.primary, ...SHADOWS.small,
  },
  logTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  logBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  logEventText: { ...TYPO.overline, fontWeight: '800', fontSize: 10 },
  logTime: { ...TYPO.caption, color: COLORS.textMuted, fontSize: 10 },
  logMessage: { ...TYPO.bodySmall, color: COLORS.textPrimary, marginTop: 4 },
  logTarget: { ...TYPO.caption, color: COLORS.textSecondary, marginTop: 4, fontStyle: 'italic' },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { ...TYPO.body, color: COLORS.textMuted },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalContent: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusLg, padding: 20, ...SHADOWS.large,
  },
  modalTitle: { ...TYPO.h4, color: COLORS.textPrimary, marginBottom: 8 },
  modalHint: { ...TYPO.bodySmall, color: COLORS.textSecondary, marginBottom: 16 },
  modalInputRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  modalInputLabel: { ...TYPO.caption, color: COLORS.textSecondary, marginBottom: 4 },
  modalInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radiusSm,
    paddingHorizontal: 12, paddingVertical: 10, ...TYPO.body, color: COLORS.textPrimary,
  },
  modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  modalCancelBtn: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.background,
  },
  modalCancelText: { ...TYPO.button, color: COLORS.textSecondary },
  modalConfirmBtn: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.primary, ...SHADOWS.small,
  },
  modalConfirmText: { ...TYPO.button, color: '#fff' },
});
