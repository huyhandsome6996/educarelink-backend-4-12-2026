// SEE ARTIFACTS - temporary minimal fix
import React, {useState, useEffect, useRef} from 'react';
import {View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, Alert, Platform, TextInput, ScrollView, Animated} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getCandidates, approveCandidate, getWorkerProfile } from '../../api/tasks';
import { getCandidateRecommendations } from '../../api/ai_recommendations';
import {COLORS, SHADOWS, SIZES, TYPO, ANIM} from '../../theme/colors';
import { showComingSoon } from '../../utils/comingSoon';
import { resolveTier } from '../../utils/carePartnerTier';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CandidatesScreen() {
  const navigation = useNavigation();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: ANIM.timingNormal, useNativeDriver: true }).start();
  }, [fadeAnim]);
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const { taskId, taskTitle } = route.params || {};
  const [candidates, setCandidates] = useState([]);
  const [workerRatings, setWorkerRatings] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getCandidates(taskId)
      .then(res => {
        setCandidates(res.data || []);
        (res.data || []).forEach(c => {
          getWorkerProfile(c.worker)
            .then(profileRes => {
              setWorkerRatings(prev => ({
                ...prev,
                [c.worker]: {
                  avg: profileRes.data.avg_rating || 0,
                  count: profileRes.data.review_count || 0,
                  tier: profileRes.data.tier,
                  tier_label: profileRes.data.tier_label,
                }
              }));
            })
            .catch(() => {});
        });
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [taskId]);

  const handleApprove = async (appId, workerName) => {
    try {
      const res = await approveCandidate(appId);
      if (Platform.OS === 'web') {
        alert(`Đã nhận! ${res.data.message}`);
        navigation.goBack();
      } else {
        Alert.alert('Đã nhận!', res.data.message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      }
    } catch (e) {
      const msg = e.response?.data?.error || 'Thao tác thất bại.';
      if (Platform.OS === 'web') alert(`Lỗi: ${msg}`);
      else Alert.alert('Lỗi', msg);
    }
  };

  const renderCandidate = ({ item: c }) => {
    const rating = workerRatings[c.worker];
    const tier = resolveTier({
      worker_tier: c.worker_tier,
      worker_tier_label: c.worker_tier_label,
      tier: rating?.tier || c.tier,
      tier_label: rating?.tier_label || c.tier_label,
    });
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
        <View style={styles.cardTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{c.worker_name?.[0]?.toUpperCase() || '?'}</Text>
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>{c.worker_name}</Text>
            <View style={[styles.tierBadge, { backgroundColor: tier.bg, borderColor: tier.color }]}>
              <Ionicons name={tier.icon} size={11} color={tier.color} />
              <Text style={[styles.tierText, { color: tier.color }]}>{tier.label}</Text>
            </View>
            <Text style={styles.ratingText}>
              ★ {rating?.avg?.toFixed(1) || 'N/A'} ({rating?.count || 0} đánh giá)
            </Text>
          </View>
          <View style={[styles.statusChip, c.status === 'accepted' ? styles.statusAccepted : styles.statusPending]}>
            <Text style={styles.statusText}>{c.status === 'accepted' ? 'Đã chọn' : 'Chờ duyệt'}</Text>
          </View>
        </View>
        {c.status === 'pending' && (
          <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(c.id, c.worker_name)} activeOpacity={0.85}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.approveBtnText}>Chấp nhận</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceWarm} />
      <View style={[styles.appBar, { paddingTop: insets.top + 32 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.appBarBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Ứng viên</Text>
        <View style={styles.appBarBtn} />
      </View>
      {taskTitle ? (
        <View style={styles.taskBar}>
          <Text style={styles.taskBarText} numberOfLines={1}>{taskTitle}</Text>
        </View>
      ) : null}
      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={candidates}
          keyExtractor={i => String(i.id)}
          renderItem={renderCandidate}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Chưa có ứng viên</Text>
            </View>
          }
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  appBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 12, backgroundColor: COLORS.surface },
  appBarBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  appBarTitle: { ...TYPO.h3, color: COLORS.onSurface },
  taskBar: { paddingHorizontal: 20, paddingVertical: 8, backgroundColor: COLORS.surfaceContainerLow },
  taskBarText: { ...TYPO.caption, color: COLORS.onSurfaceVariant },
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 12, paddingTop: 12 },
  card: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: COLORS.outlineVariant, gap: 14, ...SHADOWS.small },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: COLORS.textOnPrimary, ...TYPO.h3 },
  cardInfo: { flex: 1, gap: 4 },
  cardName: { ...TYPO.h4, color: COLORS.onSurface },
  tierBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  tierText: { fontSize: 10, fontWeight: '700' },
  ratingText: { ...TYPO.caption, color: COLORS.onSurfaceVariant },
  statusChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  statusAccepted: { backgroundColor: COLORS.secondaryLight },
  statusPending: { backgroundColor: COLORS.warningBg },
  statusText: { fontSize: 10, fontWeight: '700', color: COLORS.warning },
  approveBtn: { backgroundColor: COLORS.primary, borderRadius: 14, height: 46, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, ...SHADOWS.large },
  approveBtnText: { ...TYPO.buttonSmall, color: COLORS.textOnPrimary },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { ...TYPO.h4, color: COLORS.onSurface },
});
