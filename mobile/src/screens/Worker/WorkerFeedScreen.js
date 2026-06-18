import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl, TextInput, Platform, Alert, Animated } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getAllTasks, applyTask, getMyJobsAsWorker } from '../../api/tasks';
import { getWorkerRecommendations } from '../../api/ai_recommendations';
import NotificationBell from '../../components/NotificationBell';
import { COLORS, SHADOWS, SIZES, TYPO, FRAGMENTS } from '../../theme/colors';

const CATEGORY_MAP = [
  { id: 1, icon: require('../../../assets/images/icon_tutoring.png'), name: 'Gia sư', color: COLORS.primary },
  { id: 2, icon: require('../../../assets/images/icon_pickup.png'), name: 'Đón trẻ', color: COLORS.primary },
  { id: 3, icon: require('../../../assets/images/icon_cleaning.png'), name: 'Dọn dẹp', color: COLORS.primary },
  { id: 4, icon: require('../../../assets/images/icon_babysitting.png'), name: 'Trông trẻ', color: COLORS.primary },
  { id: 5, icon: require('../../../assets/images/icon_shopping.png'), name: 'Mua sắm', color: COLORS.primary },
  { id: 6, icon: require('../../../assets/images/icon_cooking.png'), name: 'Nấu ăn', color: COLORS.primary },
  { id: 7, icon: require('../../../assets/images/icon_moving.png'), name: 'Chuyển đồ', color: COLORS.primary },
  { id: 8, icon: require('../../../assets/images/icon_other.png'), name: 'Khác', color: COLORS.primary },
];

export default function WorkerFeedScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [appliedTaskIds, setAppliedTaskIds] = useState([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const bounceAnim = useRef(new Animated.Value(0)).current;

  // AI Recommendations state
  const [aiRecs, setAiRecs] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHasError, setAiHasError] = useState(false);

  const fetchTasks = async () => {
    try {
      const res = await getAllTasks();
      // Chỉ hiện các việc đang 'open'
      setTasks(res.data.filter(t => t.status === 'open'));

      // Lấy danh sách việc sinh viên đã ứng tuyển
      const jobsRes = await getMyJobsAsWorker();
      const ids = jobsRes.data.map(job => job.task);
      setAppliedTaskIds(ids);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); setRefreshing(false); }
  };

  // ===== AI RECOMMENDATIONS =====
  const loadAIRecommendations = async (forceRefresh = false) => {
    setAiLoading(true);
    setAiHasError(false);
    try {
      const res = await getWorkerRecommendations(forceRefresh);
      if (res.data?.has_ai && res.data?.recommendations?.length > 0) {
        setAiRecs(res.data.recommendations.slice(0, 3));
      } else {
        setAiRecs([]);
      }
    } catch (e) {
      console.warn('AI recommendations failed:', e);
      setAiHasError(true);
      setAiRecs([]);
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    loadAIRecommendations();
  }, []);

  // Empty state bounce animation
  useEffect(() => {
    if (!isLoading && tasks.length === 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(bounceAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(bounceAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [isLoading, tasks.length]);

  const bounceTransform = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  const handleApply = (taskId) => {
    const startApply = async () => {
      try {
        const res = await applyTask(taskId);
        setAppliedTaskIds(prev => [...prev, taskId]);
        if (Platform.OS === 'web') {
          alert('✅ Thành công! Đã ứng tuyển!');
        } else {
          Alert.alert('✅', res.data.message || 'Đã ứng tuyển!');
        }
      } catch (e) {
        const msg = e.response?.data?.error || e.response?.data?.message || 'Thao tác thất bại.';
        if (Platform.OS === 'web') {
          alert(`Thông báo: ${msg}`);
        } else {
          Alert.alert('Thông báo', msg);
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Bạn muốn ứng tuyển việc này?')) {
        startApply();
      }
    } else {
      Alert.alert('Ứng tuyển', 'Bạn muốn ứng tuyển việc này?', [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Ứng tuyển', onPress: startApply },
      ]);
    }
  };


  const filtered = tasks.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.location.toLowerCase().includes(search.toLowerCase())
  );

  const displayName = user?.first_name || user?.username || 'Bạn';

  const renderItem = ({ item: task }) => {
    const hasApplied = appliedTaskIds.includes(task.id);
    const cat = CATEGORY_MAP.find(c => c.id === task.category) || CATEGORY_MAP[7];
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.9}
        onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}>
        {/* Card header */}
        <View style={styles.cardHeader}>
          <View style={styles.categoryPill}>
            <View style={styles.catIconCircle}>
              <Image source={cat.icon} style={styles.catImage} resizeMode="contain" />
            </View>
            <Text style={styles.categoryPillText}>{cat.name}</Text>
          </View>
          <Text style={styles.cardPrice}>{parseInt(task.price).toLocaleString('vi-VN')}đ</Text>
        </View>

        {/* Title */}
        <Text style={styles.cardTitle} numberOfLines={2}>{task.title}</Text>

        {/* Meta info */}
        <View style={styles.metaSection}>
          <View style={styles.metaRow}>
            <View style={styles.metaIconBox}>
              <Ionicons name="time-outline" size={14} color={COLORS.primary} />
            </View>
            <Text style={styles.metaText}>{new Date(task.scheduled_time).toLocaleString('vi-VN')}</Text>
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaIconBox}>
              <Ionicons name="location-outline" size={14} color={COLORS.primary} />
            </View>
            <Text style={styles.metaText}>{task.location}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.cardFooter}>
          <View style={styles.parentInfo}>
            <View style={styles.parentAvatar}>
              <Text style={styles.parentAvatarText}>{task.parent_name?.[0]?.toUpperCase() || 'P'}</Text>
            </View>
            <Text style={styles.parentLabel}>{task.parent_name}</Text>
          </View>
          <TouchableOpacity
            style={[styles.applyBtn, hasApplied && styles.applyBtnDisabled]}
            onPress={() => handleApply(task.id)}
            disabled={hasApplied}
            activeOpacity={0.85}
          >
            <Ionicons name={hasApplied ? "checkmark" : "paper-plane"} size={14} color="#fff" />
            <Text style={styles.applyBtnText}>{hasApplied ? 'Đã ứng tuyển' : 'Ứng tuyển'}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };


  const listHeaderComponent = React.useMemo(() => (
    <>
      {/* ===== AI RECOMMENDATIONS SECTION ===== */}
      {(aiLoading || aiRecs.length > 0 || aiHasError) && (
        <View style={styles.aiSection}>
          <View style={styles.aiHeader}>
            <View style={styles.aiHeaderLeft}>
              <Ionicons name="sparkles" size={18} color={COLORS.primary} />
              <Text style={styles.aiHeaderTitle}>AI gợi ý cho bạn</Text>
            </View>
            <TouchableOpacity onPress={() => loadAIRecommendations(true)} disabled={aiLoading}>
              <Ionicons name="refresh" size={16} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {aiLoading ? (
            <View style={styles.aiLoadingBox}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.aiLoadingText}>AI đang phân tích hồ sơ của bạn...</Text>
            </View>
          ) : aiHasError ? (
            <View style={styles.aiErrorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={COLORS.textMuted} />
              <Text style={styles.aiErrorText}>Không tải được gợi ý AI. Nhấn 🔄 để thử lại.</Text>
            </View>
          ) : (
            aiRecs.map((rec, idx) => {
              const t = rec.task;
              if (!t) return null;
              const score = rec.match_score || 0;
              const scoreColor = score >= 80 ? COLORS.success : score >= 50 ? COLORS.warning : COLORS.textMuted;
              const scoreLabel = score >= 80 ? 'Rất phù hợp' : score >= 50 ? 'Phù hợp' : 'Ít phù hợp';
              return (
                <TouchableOpacity
                  key={`ai_${idx}`}
                  style={styles.aiCard}
                  onPress={() => navigation.navigate('TaskDetail', { taskId: t.id })}
                  activeOpacity={0.85}
                >
                  <View style={styles.aiCardHeader}>
                    <View style={[styles.aiScoreBadge, { backgroundColor: scoreColor + '20', borderColor: scoreColor }]}>
                      <Text style={[styles.aiScoreText, { color: scoreColor }]}>{scoreLabel} {score}</Text>
                    </View>
                    {t.has_geofence && (
                      <View style={styles.aiGeoBadge}>
                        <Ionicons name="location" size={10} color={COLORS.info} />
                        <Text style={styles.aiGeoText}>Tracking</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.aiTaskTitle} numberOfLines={1}>{t.title}</Text>
                  <Text style={styles.aiReason} numberOfLines={2}>{rec.reason}</Text>
                  <View style={styles.aiCardMeta}>
                    <View style={styles.aiMetaItem}>
                      <Ionicons name="location-outline" size={11} color={COLORS.textMuted} />
                      <Text style={styles.aiMetaText} numberOfLines={1}>{t.location}</Text>
                    </View>
                    <Text style={styles.aiPrice}>{parseInt(t.price).toLocaleString('vi-VN')}đ</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}

      <Text style={styles.listHeader}>{filtered.length} việc làm mới nhất</Text>
    </>
  ), [aiRecs, aiLoading, navigation, filtered.length]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      {/* Header */}
      <View style={styles.header}>
        {/* Decorative circles */}
        <View style={styles.headerDeco1} />
        <View style={styles.headerDeco2} />
        <View style={styles.headerDeco3} />
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerGreet}>Carepartner</Text>
            <Text style={styles.headerName}>Chào, {displayName}!</Text>
          </View>
          <NotificationBell />
        </View>
        {/* Search bar */}
        <View style={[styles.searchBar, searchFocused && styles.searchBarFocused]}>
          <Ionicons name="search-outline" size={18} color={searchFocused ? COLORS.primary : COLORS.textMuted} />
          <TextInput style={styles.searchInput} placeholder="Tìm kiếm công việc..."
            placeholderTextColor={COLORS.textMuted} value={search} onChangeText={setSearch}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)} />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList data={filtered} keyExtractor={i => i.id.toString()} renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTasks(); loadAIRecommendations(); }} tintColor={COLORS.primary} />}
          ListHeaderComponent={listHeaderComponent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Animated.View style={[styles.emptyIconCircle, { transform: [{ translateY: bounceTransform }] }]}>
                <Ionicons name="search-outline" size={36} color={COLORS.primary} />
              </Animated.View>
              <Text style={styles.emptyTitle}>Không tìm thấy công việc</Text>
              <Text style={styles.emptyText}>Kéo xuống để làm mới danh sách</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  // === HEADER ===
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
    overflow: 'hidden',
    position: 'relative',
  },
  headerDeco1: {
    position: 'absolute', top: -30, right: -20,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerDeco2: {
    position: 'absolute', bottom: -15, left: -25,
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerDeco3: {
    position: 'absolute', top: 20, right: 80,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerGreet: { ...TYPO.overline, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' },
  headerName: { ...TYPO.h2, color: '#fff' },
  notifBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: SIZES.radiusMd,
    paddingHorizontal: 14, height: 48, gap: 10,
    borderWidth: 1.5, borderColor: 'transparent',
    ...SHADOWS.small,
  },
  searchBarFocused: {
    ...FRAGMENTS.inputFocus,
    ...SHADOWS.inputFocus,
  },
  searchInput: { flex: 1, ...TYPO.body, color: COLORS.textPrimary },
  // === LIST ===
  list: { padding: SIZES.md, paddingBottom: 30 },
  listHeader: {
    ...TYPO.overline, color: COLORS.textMuted,
    marginBottom: 12,
  },
  // === CARD ===
  card: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: 16,
    marginBottom: 12,
    ...SHADOWS.cardHover,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  categoryPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: SIZES.radiusSm, paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: COLORS.primaryLight,
  },
  catIconCircle: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(242,101,34,0.12)', justifyContent: 'center', alignItems: 'center',
  },
  catImage: { width: 14, height: 14 },
  categoryPillText: { ...TYPO.caption, color: COLORS.primary },
  cardPrice: { ...TYPO.h3, color: COLORS.primary },
  cardTitle: { ...TYPO.h4, color: COLORS.textPrimary, marginBottom: 10 },
  // === META ===
  metaSection: { gap: 6, marginBottom: 12 },
  metaRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  metaIconBox: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.surfaceAlt, justifyContent: 'center', alignItems: 'center',
  },
  metaText: { ...TYPO.bodySmall, color: COLORS.textSecondary, flex: 1 },
  // === FOOTER ===
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  parentInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  parentAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: COLORS.primarySoft, justifyContent: 'center', alignItems: 'center',
  },
  parentAvatarText: { color: COLORS.primary, ...TYPO.buttonSmall },
  parentLabel: { ...TYPO.caption, color: COLORS.textMuted, fontWeight: '600' },
  applyBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusSm,
    paddingHorizontal: 14, paddingVertical: 9,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    ...SHADOWS.small,
    boxShadow: '0px 2px 8px rgba(242, 101, 34, 0.3)',
  },
  applyBtnDisabled: {
    backgroundColor: COLORS.textMuted,
    boxShadow: '0px 0px 4px rgba(0, 0, 0, 0.05)',
    opacity: 0.7,
  },
  applyBtnText: { color: '#fff', ...TYPO.buttonSmall },
  // === EMPTY ===
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.small,
  },
  emptyTitle: { ...TYPO.h4, color: COLORS.textPrimary },
  emptyText: { ...TYPO.bodySmall, color: COLORS.textMuted },

  // === AI RECOMMENDATIONS ===
  aiSection: {
    marginBottom: 16,
  },
  aiHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  aiHeaderLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  aiHeaderTitle: {
    ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700',
  },
  aiLoadingBox: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
    backgroundColor: COLORS.primaryLight, padding: 14, borderRadius: SIZES.radiusMd,
    borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  aiLoadingText: { ...TYPO.bodySmall, color: COLORS.primary },
  aiErrorBox: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    backgroundColor: COLORS.background, padding: 12, borderRadius: SIZES.radiusSm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  aiErrorText: { ...TYPO.bodySmall, color: COLORS.textMuted, flex: 1 },
  aiCard: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radiusMd,
    padding: 14, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: COLORS.primary,
    ...SHADOWS.cardHover,
  },
  aiCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6,
  },
  aiScoreBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: SIZES.radiusXs,
    borderWidth: 1,
  },
  aiScoreText: { ...TYPO.caption, fontWeight: '700', fontSize: 10 },
  aiGeoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.infoBg, borderRadius: SIZES.radiusXs,
    paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, borderColor: '#bfdbfe',
  },
  aiGeoText: { ...TYPO.caption, fontSize: 9, color: COLORS.info, fontWeight: '700' },
  aiTaskTitle: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700', marginBottom: 4 },
  aiReason: { ...TYPO.bodySmall, color: COLORS.textSecondary, lineHeight: 18, marginBottom: 8 },
  aiCardMeta: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  aiMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  aiMetaText: { ...TYPO.caption, color: COLORS.textMuted, flex: 1 },
  aiPrice: { ...TYPO.bodySmall, color: COLORS.primary, fontWeight: '900' },
});
