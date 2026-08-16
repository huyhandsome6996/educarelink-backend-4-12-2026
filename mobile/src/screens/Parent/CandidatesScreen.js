// ============================================================
// CandidatesScreen — Redesign theo Warm Professionalism (Stitch AI)
// Thay đổi:
// - Top App Bar: trắng + avatar + brand 'EduCareLink' + filter icon
// - Search bar: trắng, border outline-variant, icon search, radius 14
// - Filter chips: pill style (active = primary-container bg)
// - 'Ứng viên phù hợp' section title (h3)
// - Card: surface-container-lowest bg, radius 20, border outline-variant,
//   avatar tròn 56px (initials) + name + verified badge + rating stars
//   + status chip + 'Chấp nhận' button (pending only)
// - AI insights panel giữ nguyên, chỉ restyle màu
// - Background: surfaceWarm
// Giữ nguyên: logic getCandidates, approveCandidate, getWorkerProfile,
//   AI insights, refresh, navigation sang CandidateProfile
// ============================================================

import React, {useState, useEffect, useRef} from 'react';
import {View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, Alert, Platform, TextInput, ScrollView, Animated} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getCandidates, approveCandidate, getWorkerProfile } from '../../api/tasks';
import { getCandidateRecommendations } from '../../api/ai_recommendations';
import {COLORS, SHADOWS, SIZES, TYPO, ANIM} from '../../theme/colors';
import { showComingSoon } from '../../utils/comingSoon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Filter chips — cosmetic (không thay đổi logic filter hiện tại)
const FILTER_CHIPS = [
  { id: 'all', label: 'Tất cả', icon: 'apps' },
  { id: 'verified', label: 'Đã xác thực', icon: 'shield-checkmark' },
  { id: 'high-rated', label: 'Đánh giá cao', icon: 'star' },
  { id: 'nearby', label: 'Gần bạn', icon: 'location' },
];

export default function CandidatesScreen() {
  const navigation = useNavigation();

  // QA-FIX-UI 3.2: fade-in animation khi mount (opacity 0→1)
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: ANIM.timingNormal,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const { taskId, taskTitle } = route.params || {};
  const [candidates, setCandidates] = useState([]);
  const [workerRatings, setWorkerRatings] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  const [aiInsights, setAiInsights] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    getCandidates(taskId)
      .then(res => {
        setCandidates(res.data);
        res.data.forEach(c => {
          getWorkerProfile(c.worker)
            .then(profileRes => {
              setWorkerRatings(prev => ({
                ...prev,
                [c.worker]: {
                  avg: profileRes.data.avg_rating || 0,
                  count: profileRes.data.review_count || 0
                }
              }));
            })
            .catch(() => {});
        });

        const hasPending = res.data.some(c => c.status === 'pending');
        if (hasPending) {
          setAiLoading(true);
          getCandidateRecommendations(taskId)
            .then(r => setAiInsights(r.data))
            .catch(e => console.warn('AI insights failed:', e))
            .finally(() => setAiLoading(false));
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [taskId]);

  const reloadAIInsights = () => {
    setAiLoading(true);
    getCandidateRecommendations(taskId, true)
      .then(r => setAiInsights(r.data))
      .catch(e => console.warn(e))
      .finally(() => setAiLoading(false));
  };

  const handleApprove = async (appId, workerName) => {
    const startApprove = async () => {
      try {
        const res = await approveCandidate(appId);
        if (Platform.OS === 'web') {
          alert(`Đã nhận! ${res.data.message}`);
          navigation.goBack();
        } else {
          Alert.alert('Đã nhận!', res.data.message, [
            { text: 'OK', onPress: () => navigation.goBack() }
          ]);
        }
      } catch (e) {
        const msg = e.response?.data?.error || 'Thao tác thất bại.';
        if (Platform.OS === 'web') {
          alert(`Lỗi: ${msg}`);
        } else {
          Alert.alert('Lỗi', msg);
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Xác nhận: Chấp nhận ${workerName} làm việc này?\nCác ứng viên khác sẽ tự động bị từ chối.`)) {
        startApprove();
      }
    } else {
      Alert.alert('Xác nhận', `Chấp nhận ${workerName} làm việc này?\nCác ứng viên khác sẽ tự động bị từ chối.`, [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Chấp nhận', style: 'default', onPress: startApprove },
      ]);
    }
  };

  // Filter candidates by search query (cosmetic)
  const filteredCandidates = candidates.filter(c =>
    !searchQuery || c.worker_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderCandidate = ({ item: c }) => {
    const rating = workerRatings[c.worker];
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('CandidateProfile', {
          workerId: c.worker,
          applicationId: c.id,
          isPending: c.status === 'pending'
        })}
      >
        {/* Top row: avatar + name + rating + verified + status chip */}
        <View style={styles.cardTop}>
          {/* Avatar tròn 56px với initials */}
          <View style={styles.avatarBox}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{c.worker_name?.[0]?.toUpperCase() || '?'}</Text>
            </View>
            {c.status === 'accepted' && (
              <View style={styles.avatarBadge}>
                <Ionicons name="checkmark" size={10} color="#fff" />
              </View>
            )}
          </View>

          <View style={styles.cardInfo}>
            <View style={styles.cardNameRow}>
              <Text style={styles.cardName} numberOfLines={1}>{c.worker_name}</Text>
              <Ionicons name="shield-checkmark" size={14} color={COLORS.secondary} />
            </View>
            <View style={styles.cardRatingRow}>
              {[1,2,3,4,5].map(i => (
                <Ionicons
                  key={i}
                  name={rating?.avg >= i ? 'star' : 'star-outline'}
                  size={12}
                  color={COLORS.ratingStar}
                />
              ))}
              <Text style={styles.cardRatingText}>
                {rating?.avg?.toFixed(1) || 'N/A'}
              </Text>
              <Text style={styles.cardTripsText}>
                ({rating?.count || 0} đánh giá)
              </Text>
            </View>
          </View>

          <View style={[
            styles.statusChip,
            c.status === 'accepted' ? styles.statusAccepted : styles.statusPending,
          ]}>
            <Text style={[
              styles.statusChipText,
              c.status === 'accepted' ? styles.statusTextAccepted : styles.statusTextPending,
            ]}>
              {c.status === 'accepted' ? 'Đã chọn' : 'Chờ duyệt'}
            </Text>
          </View>
        </View>

        {/* Approve button — chỉ hiện khi pending */}
        {c.status === 'pending' && (
          <TouchableOpacity
            style={styles.approveBtn}
            onPress={() => handleApprove(c.id, c.worker_name)}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.approveBtnText}>Chấp nhận {c.worker_name}</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const listHeaderComponent = React.useMemo(() => (
    <>
      {/* AI INSIGHTS PANEL — giữ nguyên logic, restyle màu */}
      {(aiLoading || (aiInsights?.has_ai && aiInsights?.recommendations?.length > 0)) && (
        <View style={styles.aiPanel}>
          <View style={styles.aiPanelHeader}>
            <View style={styles.aiPanelHeaderLeft}>
              <Ionicons name="sparkles" size={16} color={COLORS.primary} />
              <Text style={styles.aiPanelTitle}>AI đánh giá ứng viên</Text>
            </View>
            <TouchableOpacity onPress={reloadAIInsights} disabled={aiLoading} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="refresh" size={14} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {aiLoading && !aiInsights ? (
            <View style={styles.aiLoadingBox}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.aiLoadingText}>AI đang phân tích các ứng viên...</Text>
            </View>
          ) : (
            <>
              {aiInsights?.summary ? (
                <Text style={styles.aiSummary}>{aiInsights.summary}</Text>
              ) : null}
              {aiInsights?.recommendations?.map((rec, idx) => {
                const w = rec.worker;
                if (!w) return null;
                const score = rec.match_score || 0;
                const scoreColor = score >= 80 ? COLORS.success : score >= 50 ? COLORS.warning : COLORS.textMuted;
                const scoreLabel = score >= 80 ? 'Rất phù hợp' : score >= 50 ? 'Phù hợp' : 'Ít phù hợp';
                const displayName = (w.first_name || w.last_name)
                  ? `${w.first_name} ${w.last_name || ''}`.trim()
                  : w.username;
                return (
                  <View key={`ai_${idx}`} style={styles.aiInsightCard}>
                    <View style={styles.aiInsightHeader}>
                      <View style={styles.aiInsightAvatar}>
                        <Text style={styles.aiInsightAvatarText}>{displayName[0]?.toUpperCase() || '?'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.aiInsightName}>{displayName}</Text>
                        <View style={[styles.aiInsightScore, { backgroundColor: scoreColor + '20', borderColor: scoreColor }]}>
                          <Text style={[styles.aiInsightScoreText, { color: scoreColor }]}>{scoreLabel} · {score}/100</Text>
                        </View>
                      </View>
                    </View>
                    <Text style={styles.aiInsightReason}>{rec.reason}</Text>
                    {rec.highlight && rec.highlight !== '—' ? (
                      <View style={styles.aiInsightHighlight}>
                        <Ionicons name="star" size={11} color={COLORS.success} />
                        <Text style={styles.aiInsightHighlightText}>{rec.highlight}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
              <Text style={styles.aiDisclaimer}>* Gợi ý AI chỉ tham khảo. Quyền quyết định thuộc về bạn.</Text>
            </>
          )}
        </View>
      )}

      <Text style={styles.sectionTitle}>
        {filteredCandidates.length} CarePartner đã ứng tuyển
      </Text>
    </>
  ), [aiLoading, aiInsights, filteredCandidates.length]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceWarm} />

      {/* Top App Bar — trắng */}
      <View style={[styles.appBar, { paddingTop: insets.top + 32 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.appBarBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
         accessibilityRole="button" accessibilityLabel="Quay lại">
          <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Ứng viên</Text>
        <TouchableOpacity
          style={styles.appBarBtn}
          onPress={() => showComingSoon('Bộ lọc nâng cao')}
        >
          <Ionicons name="filter" size={20} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Task title sub-bar */}
      {taskTitle ? (
        <View style={styles.taskBar}>
          <Ionicons name="document-text-outline" size={14} color={COLORS.onSurfaceVariant} />
          <Text style={styles.taskBarText} numberOfLines={1}>{taskTitle}</Text>
        </View>
      ) : null}

      {/* Search bar + filter chips */}
      <View style={styles.searchSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={COLORS.onSurfaceVariant} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm kiếm CarePartner..."
            placeholderTextColor={COLORS.outline}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={16} color={COLORS.outlineVariant} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filter chips — horizontal scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {FILTER_CHIPS.map((chip) => (
            <TouchableOpacity
              key={chip.id}
              style={[styles.chip, activeFilter === chip.id && styles.chipActive]}
              onPress={() => {
                setActiveFilter(chip.id);
                if (chip.id !== 'all') showComingSoon(`Lọc theo ${chip.label}`);
              }}
              activeOpacity={0.85}
            >
              <Ionicons
                name={chip.icon}
                size={14}
                color={activeFilter === chip.id ? '#ffffff' : COLORS.onSurfaceVariant}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.chipText, activeFilter === chip.id && styles.chipTextActive]}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filteredCandidates}
          keyExtractor={i => i.id.toString()}
          renderItem={renderCandidate}
          contentContainerStyle={styles.list}
          ListHeaderComponent={listHeaderComponent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="people-outline" size={40} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>Chưa có ứng viên</Text>
              <Text style={styles.emptyText}>Các CarePartner sẽ sớm ứng tuyển. Hãy kiên nhẫn chờ đợi!</Text>
            </View>
          }
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  // === APP BAR ===
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: COLORS.surface,
  },
  appBarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appBarTitle: {
    ...TYPO.h3,
    color: COLORS.onSurface,
  },
  // === TASK BAR ===
  taskBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: COLORS.surfaceContainerLow,
  },
  taskBarText: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    flex: 1,
  },
  // === SEARCH SECTION ===
  searchSection: {
    padding: 20,
    paddingBottom: 12,
    gap: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 44,
    ...SHADOWS.small,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    ...TYPO.body,
    color: COLORS.onSurface,
    paddingVertical: 0,
  },
  // === CHIPS ===
  chipRow: {
    gap: 8,
    paddingRight: 20,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    ...SHADOWS.small,
  },
  chipText: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
  },
  chipTextActive: {
    color: '#ffffff',
  },
  // === LIST ===
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  sectionTitle: {
    ...TYPO.h3,
    color: COLORS.onSurface,
    marginTop: 8,
    marginBottom: 4,
  },
  // === CARD ===
  card: {
    backgroundColor: COLORS.surface, // surface-container-lowest
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    gap: 14,
    ...SHADOWS.small,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarBox: {
    position: 'relative',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  avatarText: {
    color: '#fff',
    ...TYPO.h3,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardName: {
    ...TYPO.h4,
    color: COLORS.onSurface,
    flex: 1,
  },
  cardRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  cardRatingText: {
    ...TYPO.caption,
    color: COLORS.onSurface,
    fontWeight: '700',
    marginLeft: 4,
  },
  cardTripsText: {
    fontSize: 10,
    color: COLORS.onSurfaceVariant,
    fontWeight: '500',
  },
  // === STATUS CHIP ===
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusAccepted: {
    backgroundColor: COLORS.secondaryLight,
  },
  statusPending: {
    backgroundColor: COLORS.warningBg,
  },
  statusChipText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusTextAccepted: {
    color: COLORS.secondaryDark,
  },
  statusTextPending: {
    color: COLORS.warning,
  },
  // === APPROVE BUTTON ===
  approveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    height: 46,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    ...SHADOWS.large,
  },
  approveBtnText: {
    ...TYPO.buttonSmall,
    color: '#ffffff',
  },
  // === EMPTY STATE ===
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 4, ...SHADOWS.small,
  },
  emptyTitle: { ...TYPO.h4, color: COLORS.onSurface },
  emptyText: { ...TYPO.bodySmall, color: COLORS.onSurfaceVariant, textAlign: 'center', paddingHorizontal: 20 },
  // === AI INSIGHTS PANEL ===
  aiPanel: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
  },
  aiPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  aiPanelHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiPanelTitle: { ...TYPO.h5, color: COLORS.primary, fontWeight: '700' },
  aiLoadingBox: {
    flexDirection: 'row', gap: 8, alignItems: 'center', padding: 8,
  },
  aiLoadingText: { ...TYPO.bodySmall, color: COLORS.primary },
  aiSummary: { ...TYPO.bodySmall, color: COLORS.onSurfaceVariant, marginBottom: 10, lineHeight: 18 },
  aiInsightCard: {
    backgroundColor: COLORS.surface, borderRadius: 12,
    padding: 10, marginBottom: 8,
  },
  aiInsightHeader: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 6 },
  aiInsightAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center',
  },
  aiInsightAvatarText: { color: COLORS.primary, fontWeight: '800', fontSize: 13 },
  aiInsightName: { ...TYPO.bodySmall, fontWeight: '700', color: COLORS.onSurface, marginBottom: 3 },
  aiInsightScore: {
    alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 6, borderWidth: 1,
  },
  aiInsightScoreText: { ...TYPO.caption, fontSize: 10, fontWeight: '700' },
  aiInsightReason: { ...TYPO.caption, color: COLORS.onSurfaceVariant, lineHeight: 16, marginBottom: 4 },
  aiInsightHighlight: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.secondaryLight, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  aiInsightHighlightText: { ...TYPO.caption, color: COLORS.secondaryDark, fontSize: 10, fontWeight: '700' },
  aiDisclaimer: {
    ...TYPO.caption, color: COLORS.onSurfaceVariant, fontStyle: 'italic',
    marginTop: 4, textAlign: 'center',
  },
});
