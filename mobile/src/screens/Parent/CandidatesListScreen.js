// ============================================================
// CandidatesListScreen — Flow 1 Step 3: danh sách tối đa 8 CP
// Card: avatar, tên, trường/ngành, sao, số đơn, khoảng cách,
// match_level (TIẾNG VIỆT), skills, review mới nhất, tag phản hồi
// Header: "Có {total_matched} CarePartner phù hợp, hiển thị 8 người tốt nhất"
// ============================================================

import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';
import { getMatchingCandidates, MATCH_LEVEL_LABELS } from '../../api/matching';

const LEVEL_COLORS = {
  very_high: '#0E9F6E',
  high: '#F26522',
  medium: '#F5A623',
  low: '#9CA3AF',
};

export default function CandidatesListScreen() {
  const navigation = useNavigation();
  const { params: { jobId } } = useRoute();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError('');
    try {
      const { data: res } = await getMatchingCandidates(jobId);
      setData(res);
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'slot_taken') setError('Đơn vừa được chọn bởi người khác. Vui lòng làm mới.');
      else setError('Không tải được danh sách ứng viên. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.85}
      onPress={() => navigation.navigate('CandidateProfileV2', {
        candidate: item, jobId,
      })}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {(item.display_name || '?').charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{item.display_name}</Text>
          <View style={[styles.levelBadge, { backgroundColor: LEVEL_COLORS[item.match_level] || '#999' }]}>
            <Text style={styles.levelText}>
              {item.match_level_vi || MATCH_LEVEL_LABELS[item.match_level]}
            </Text>
          </View>
        </View>
        {!!(item.school || item.major) && (
          <Text style={styles.sub} numberOfLines={1}>
            {[item.school, item.major].filter(Boolean).join(' · ')}
          </Text>
        )}
        <View style={styles.metaRow}>
          <Ionicons name="star" size={13} color="#F5A623" />
          <Text style={styles.meta}>{item.rating ?? 0} ({item.completed_jobs} đơn)</Text>
          <Ionicons name="location" size={13} color={COLORS.primary} />
          <Text style={styles.meta}>
            {item.distance_km != null ? `${item.distance_km} km` : '—'}
          </Text>
          <Ionicons name="checkmark-done" size={13} color="#0E9F6E" />
          <Text style={styles.meta}>Đủ lịch</Text>
        </View>
        {item.top_skills?.length > 0 && (
          <View style={styles.skillRow}>
            {item.top_skills.slice(0, 3).map((s) => (
              <View key={s} style={styles.skillChip}>
                <Text style={styles.skillText}>{s}</Text>
              </View>
            ))}
          </View>
        )}
        {!!item.latest_review && (
          <Text style={styles.review} numberOfLines={1}>"{item.latest_review}"</Text>
        )}
        {!!item.response_tag && (
          <Text style={styles.fastTag}>⚡ Phản hồi nhanh</Text>
        )}
      </View>
      <View style={styles.scoreWrap}>
        <Text style={styles.score}>{item.match_score}</Text>
        <Text style={styles.scoreLabel}>điểm</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading && !data) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={load} style={styles.retryBtn}>
            <Text style={{ color: COLORS.primary, fontWeight: '600' }}>Làm mới</Text>
          </TouchableOpacity>
        </View>
      ) : data && (
        <Text style={styles.header}>
          Có <Text style={styles.headerBold}>{data.total_matched}</Text> CarePartner phù hợp,{'\n'}
          hiển thị {data.candidates.length} người tốt nhất
        </Text>
      )}
      <FlatList
        data={data?.candidates ?? []}
        keyExtractor={(item) => item.carepartner_id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={!loading && (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={44} color="#ddd" />
            <Text style={styles.emptyText}>Chưa có CarePartner phù hợp.
              {'\n'}Hệ thống sẽ tự động tìm thêm.</Text>
          </View>
        )}
        contentContainerStyle={{ padding: SIZES.padding, paddingBottom: 40 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: SIZES.padding, paddingTop: 16, paddingBottom: 6,
    fontSize: 14, color: COLORS.gray, lineHeight: 20,
  },
  headerBold: { color: COLORS.primary, fontWeight: '700', fontSize: 16 },
  card: {
    flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: 16,
    padding: 14, marginBottom: 12, ...SHADOWS.small, alignItems: 'center',
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '700', color: COLORS.primary },
  info: { flex: 1, marginLeft: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1, marginRight: 6 },
  levelBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  levelText: { color: COLORS.white, fontSize: 11, fontWeight: '600' },
  sub: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  meta: { fontSize: 12, color: COLORS.gray, marginRight: 8 },
  skillRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  skillChip: {
    backgroundColor: COLORS.primaryLight, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  skillText: { color: COLORS.primary, fontSize: 11, fontWeight: '500' },
  review: { fontSize: 12, color: COLORS.gray, fontStyle: 'italic', marginTop: 6 },
  fastTag: { fontSize: 12, color: '#0E9F6E', marginTop: 4, fontWeight: '600' },
  scoreWrap: { alignItems: 'center', marginLeft: 10 },
  score: { fontSize: 20, fontWeight: '800', color: COLORS.primary },
  scoreLabel: { fontSize: 11, color: COLORS.gray },
  errorBox: { margin: SIZES.padding, backgroundColor: '#FEECEC', borderRadius: 12, padding: 14 },
  errorText: { color: '#C0392B', fontSize: 13 },
  retryBtn: { marginTop: 8 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { marginTop: 12, color: COLORS.gray, textAlign: 'center', lineHeight: 20 },
});
