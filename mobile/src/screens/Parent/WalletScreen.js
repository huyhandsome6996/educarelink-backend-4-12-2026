// ============================================================
// WalletScreen — Ví credit phụ huynh (Step 7.3 — credit ảo, KHÔNG tiền thật)
// Số dư + lịch sử giao dịch (đền bù từ đơn bị hủy / đã dùng trừ phí)
// ============================================================

import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, StatusBar, ActivityIndicator, RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';
import { getCreditBalance } from '../../api/matching';

const KIND_LABELS = {
  platform_credit: 'Đền bù từ hệ thống',
  service_fee_offset: 'Dùng trừ phí dịch vụ',
  admin_adjust: 'Điều chỉnh',
};

export default function WalletScreen() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: res } = await getCreditBalance();
      setData(res);
    } catch (err) {
      // Lỗi mạng/server → thông báo tiếng Việt + nút thử lại (không crash)
      setError('Không tải được ví credit. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (error && !data) {
    return <View style={[styles.container, styles.center]}>
      <Ionicons name="cloud-offline-outline" size={44} color="#d1d5db" />
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={load}>
        <Text style={styles.retryText}>Thử lại</Text>
      </TouchableOpacity>
    </View>;
  }

  if (loading && !data) {
    return <View style={[styles.container, styles.center]}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={styles.balanceCard}>
        <Ionicons name="wallet" size={26} color={COLORS.white} />
        <Text style={styles.balanceLabel}>Số dư credit</Text>
        <Text style={styles.balance}>
          {(data?.credit_vnd ?? 0).toLocaleString('vi-VN')}đ
        </Text>
        <Text style={styles.balanceNote}>
          Credit dùng để trừ phí dịch vụ cho các đơn tiếp theo — không phải tiền
          mặt, không rút được.
        </Text>
      </View>

      <Text style={styles.historyTitle}>Lịch sử giao dịch</Text>
      <FlatList
        data={data?.history ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={40} color="#ddd" />
            <Text style={styles.emptyText}>Chưa có giao dịch nào.</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.txRow}>
            <View style={styles.txIcon}>
              <Ionicons
                name={item.kind === 'platform_credit' ? 'gift' : 'arrow-down-circle'}
                size={20} color={item.kind === 'platform_credit' ? '#0E9F6E' : COLORS.gray} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.txTitle}>{KIND_LABELS[item.kind] || item.kind}</Text>
              <Text style={styles.txNote} numberOfLines={1}>{item.note || ''}</Text>
              <Text style={styles.txTime}>
                {new Date(item.issued_at).toLocaleString('vi-VN')}
              </Text>
            </View>
            <Text style={[styles.txAmount,
              { color: item.kind === 'platform_credit' ? '#0E9F6E' : COLORS.gray }]}>
              +{item.amount_vnd.toLocaleString('vi-VN')}đ
            </Text>
          </View>
        )}
        contentContainerStyle={{ paddingHorizontal: SIZES.padding, paddingBottom: 40 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  balanceCard: {
    margin: SIZES.padding, marginBottom: 8, backgroundColor: COLORS.primary,
    borderRadius: 18, padding: 22, alignItems: 'center',
  },
  balanceLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 6 },
  balance: { color: COLORS.white, fontSize: 36, fontWeight: '800', marginTop: 2 },
  balanceNote: {
    color: 'rgba(255,255,255,0.85)', fontSize: 11, textAlign: 'center',
    marginTop: 8, lineHeight: 16,
  },
  historyTitle: {
    paddingHorizontal: SIZES.padding, paddingTop: 12, paddingBottom: 8,
    fontSize: 15, fontWeight: '700', color: COLORS.text,
  },
  txRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: 14, padding: 14, marginBottom: 10, ...SHADOWS.small,
  },
  txIcon: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  txTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  txNote: { fontSize: 12, color: COLORS.gray, marginTop: 1 },
  txTime: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 50 },
  emptyText: { marginTop: 10, color: COLORS.gray },
  errorText: { marginTop: 10, color: COLORS.gray, textAlign: 'center' },
  retryBtn: {
    marginTop: 14, paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 16, backgroundColor: COLORS.primary,
  },
  retryText: { color: COLORS.white, fontWeight: '600' },
});
