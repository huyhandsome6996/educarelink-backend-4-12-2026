// ============================================================
// CareDiaryDetailScreen — nối API thật (B1)
// Hiển thị chi tiết nhật ký chăm sóc do CarePartner tạo sau khi làm việc.
// Receives: taskId, taskTitle via navigation params.
// ============================================================

import React, {useState, useRef, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Image, FlatList, Dimensions, Animated, ActivityIndicator, Alert} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {COLORS, SHADOWS, SIZES, TYPO, ANIM} from '../../theme/colors';
import { getCareDiaryEntry } from '../../api/careDiary';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STATUS_STYLE = {
  done: { icon: 'checkmark', color: COLORS.secondary, border: COLORS.secondary, label: 'Hoàn thành' },
  partial: { icon: 'ellipse', color: COLORS.primary, border: COLORS.primary, label: 'Một phần' },
  skipped: { icon: 'close', color: COLORS.onSurfaceVariant, border: COLORS.outline, label: 'Bỏ qua' },
};

export default function CareDiaryDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { taskId } = route.params || {};

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
  const [diary, setDiary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!taskId) {
      setError('Không tìm thấy thông tin công việc.');
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);
    getCareDiaryEntry(taskId)
      .then(res => {
        if (mounted) setDiary(res.data);
      })
      .catch(err => {
        if (!mounted) return;
        if (err.response?.status === 404) {
          setError('CarePartner chưa ghi nhật ký cho buổi này.');
        } else {
          const msg = err.response?.data?.error || 'Không thể tải nhật ký. Vui lòng thử lại.';
          setError(msg);
        }
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [taskId]);

  // === LOADING STATE ===
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.loadingText}>Đang tải nhật ký...</Text>
      </View>
    );
  }

  // === ERROR STATE (bao gồm 404 chưa có nhật ký) ===
  if (error || !diary) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceContainerLow} />
        <View style={[styles.appBar, { paddingTop: insets.top + 32 }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.appBarBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button" accessibilityLabel="Quay lại">
            <Ionicons name="arrow-back" size={22} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.appBarTitle}>Chi tiết nhật ký</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.errorBox}>
          <Ionicons name="book-outline" size={48} color={COLORS.onSurfaceVariant} />
          <Text style={styles.errorText}>{error || 'Không có dữ liệu.'}</Text>
        </View>
      </View>
    );
  }

  // === RENDER DIARY ===
  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceContainerLow} />

      {/* Top App Bar */}
      <View style={[styles.appBar, { paddingTop: insets.top + 32 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.appBarBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button" accessibilityLabel="Quay lại">
          <Ionicons name="arrow-back" size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Chi tiết nhật ký</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* CarePartner info card */}
        <View style={styles.cpCard}>
          <View style={styles.cpAvatarBox}>
            <View style={styles.cpAvatar}>
              <Text style={styles.cpAvatarText}>{diary.carepartner.avatarInitial}</Text>
            </View>
            {diary.carepartner.verified && (
              <View style={styles.cpVerifiedBadge}>
                <Ionicons name="shield-checkmark" size={12} color={COLORS.onSecondaryContainer} />
              </View>
            )}
          </View>
          <View style={styles.cpInfo}>
            <Text style={styles.cpName}>{diary.carepartner.name}</Text>
            <Text style={styles.cpRole}>{diary.carepartner.role}</Text>
            <Text style={styles.cpDate}>{diary.date}</Text>
          </View>
        </View>

        {/* Bento grid: Mood + Completion */}
        <View style={styles.bentoGrid}>
          {/* Mood card */}
          <View style={styles.moodCard}>
            <Text style={styles.cardTitle}>Tâm trạng của bé</Text>
            <View style={styles.moodIconCircle}>
              <Ionicons name={diary.mood.icon} size={48} color={COLORS.primary} />
            </View>
            <Text style={styles.moodLabel}>{diary.mood.label}</Text>
            {diary.mood.note ? <Text style={styles.moodNote}>{diary.mood.note}</Text> : null}
          </View>

          {/* Completion card */}
          <View style={styles.completionCard}>
            <Text style={styles.cardTitle}>Mức độ hoàn thành</Text>
            <View style={styles.completionRow}>
              <Text style={styles.completionPercent}>{diary.completion.percent}%</Text>
              <Text style={styles.completionUnit}>Mục tiêu ngày</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${diary.completion.percent}%` }]} />
            </View>
            <View style={styles.completionStatsRow}>
              {diary.completion.stats.map((stat, idx) => (
                <View key={idx} style={styles.statBox}>
                  <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Activities timeline */}
        {diary.activities && diary.activities.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hoạt động đã thực hiện</Text>
            <View style={styles.timeline}>
              {diary.activities.map((act, idx) => {
                const st = STATUS_STYLE[act.status] || STATUS_STYLE.done;
                return (
                  <View key={idx} style={styles.timelineItem}>
                    <View style={styles.timelineLeft}>
                      <View style={[styles.timelineDot, { borderColor: st.border }]}>
                        <Ionicons name={st.icon} size={14} color={st.color} />
                      </View>
                      {idx < diary.activities.length - 1 && <View style={styles.timelineLine} />}
                    </View>
                    <View style={styles.activityCard}>
                      <View style={styles.activityHeader}>
                        <Text style={styles.activityTime}>{act.time}</Text>
                        <View style={[styles.activityStatusChip, { backgroundColor: st.color + '20' }]}>
                          <Text style={[styles.activityStatusText, { color: st.color }]}>{st.label}</Text>
                        </View>
                      </View>
                      <Text style={styles.activityTitle}>{act.title}</Text>
                      {act.desc ? <Text style={styles.activityDesc}>{act.desc}</Text> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Note section */}
        {diary.note ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ghi chú thêm</Text>
            <View style={styles.noteCard}>
              <Ionicons name="chatbubble-ellipses" size={18} color={COLORS.primary} style={styles.noteIcon} />
              <Text style={styles.noteText}>{diary.note}</Text>
            </View>
          </View>
        ) : null}

        {/* Attachments */}
        {diary.attachments && diary.attachments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ảnh đính kèm ({diary.attachments.length})</Text>
            <View style={styles.attachmentRow}>
              {diary.attachments.map((att) => (
                <TouchableOpacity
                  key={att.id}
                  style={styles.attachmentBox}
                  onPress={() => {
                    if (att.url) {
                      navigation.navigate('ImagePreview', { uri: att.url, title: 'Ảnh đính kèm nhật ký' });
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <Image
                    source={{ uri: att.url }}
                    style={styles.attachmentImage}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  // === LOADING ===
  loadingContainer: {
    flex: 1, backgroundColor: COLORS.surfaceContainerLow,
    justifyContent: 'center', alignItems: 'center', gap: 12,
  },
  loadingText: { ...TYPO.body, color: COLORS.onSurfaceVariant },
  // === ERROR ===
  errorBox: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 40, gap: 16,
  },
  errorText: {
    ...TYPO.body, color: COLORS.onSurfaceVariant, textAlign: 'center',
    lineHeight: 22,
  },
  // === APP BAR ===
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: COLORS.surfaceContainerLow,
  },
  appBarBtn: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  appBarTitle: {
    ...TYPO.h2, color: COLORS.primary, flex: 1,
    textAlign: 'center', marginRight: 44,
  },
  // === SCROLL ===
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 24 },
  // === CAREPARTNER CARD ===
  cpCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: COLORS.surfaceContainer, borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: COLORS.outlineVariant, ...SHADOWS.small,
  },
  cpAvatarBox: { position: 'relative' },
  cpAvatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.primary, borderWidth: 2, borderColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  cpAvatarText: { ...TYPO.h2, color: COLORS.textOnPrimary },
  cpVerifiedBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.secondaryContainer,
    borderWidth: 2, borderColor: COLORS.surface,
    justifyContent: 'center', alignItems: 'center',
  },
  cpInfo: { flex: 1 },
  cpName: { ...TYPO.h3, color: COLORS.onSurface, marginBottom: 2 },
  cpRole: { ...TYPO.caption, color: COLORS.secondaryDark, fontWeight: '700' },
  cpDate: { ...TYPO.body, fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: 2 },
  // === BENTO GRID ===
  bentoGrid: { flexDirection: 'row', gap: 12 },
  moodCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: COLORS.outlineVariant,
    alignItems: 'center', gap: 8, ...SHADOWS.small,
  },
  completionCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: COLORS.outlineVariant, ...SHADOWS.small,
  },
  cardTitle: { ...TYPO.h4, color: COLORS.onSurface, marginBottom: 12, alignSelf: 'flex-start' },
  moodIconCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  moodLabel: { ...TYPO.h3, color: COLORS.primary, textAlign: 'center' },
  moodNote: { ...TYPO.caption, color: COLORS.onSurfaceVariant, textAlign: 'center', lineHeight: 16 },
  completionRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 8 },
  completionPercent: { ...TYPO.h1, color: COLORS.secondary, fontSize: 32 },
  completionUnit: { ...TYPO.body, fontSize: 12, color: COLORS.onSurfaceVariant, paddingBottom: 4 },
  progressBar: {
    width: '100%', height: 14, backgroundColor: COLORS.surfaceContainerHigh,
    borderRadius: 7, overflow: 'hidden', marginBottom: 12,
  },
  progressFill: { height: '100%', backgroundColor: COLORS.secondaryContainer, borderRadius: 7 },
  completionStatsRow: { flexDirection: 'row', gap: 4 },
  statBox: {
    flex: 1, backgroundColor: COLORS.surfaceContainerLow, borderRadius: 8, padding: 6,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.outlineVariant,
  },
  statValue: { ...TYPO.h4, fontWeight: '900' },
  statLabel: { fontSize: 9, color: COLORS.onSurfaceVariant, textAlign: 'center', marginTop: 2 },
  // === SECTIONS ===
  section: { gap: 12 },
  sectionTitle: { ...TYPO.h4, color: COLORS.onSurface },
  // === TIMELINE ===
  timeline: { gap: 0 },
  timelineItem: { flexDirection: 'row', gap: 12 },
  timelineLeft: { alignItems: 'center', width: 32 },
  timelineDot: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.surface,
    borderWidth: 2, justifyContent: 'center', alignItems: 'center', ...SHADOWS.small,
  },
  timelineLine: {
    width: 2, flex: 1, backgroundColor: COLORS.outlineVariant,
    marginTop: 4, marginBottom: 4, minHeight: 24,
  },
  activityCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: COLORS.outlineVariant, marginBottom: 12,
  },
  activityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  activityTime: { ...TYPO.caption, color: COLORS.primary, fontWeight: '700' },
  activityStatusChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  activityStatusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  activityTitle: { ...TYPO.h4, color: COLORS.onSurface, fontSize: 15, marginBottom: 4 },
  activityDesc: { ...TYPO.body, fontSize: 13, color: COLORS.onSurfaceVariant, lineHeight: 18 },
  // === NOTE ===
  noteCard: {
    flexDirection: 'row', gap: 10, backgroundColor: COLORS.primaryLight,
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  noteIcon: { marginTop: 2 },
  noteText: { flex: 1, ...TYPO.body, fontSize: 14, color: COLORS.onSurface, lineHeight: 22, fontStyle: 'italic' },
  // === ATTACHMENTS ===
  attachmentRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  attachmentBox: {
    width: 100, height: 100, borderRadius: 14, overflow: 'hidden', ...SHADOWS.small,
    backgroundColor: COLORS.surfaceContainerLow,
  },
  attachmentImage: { width: '100%', height: '100%' },
  // === FOOTER ===
  footer: {
    padding: 20, paddingBottom: 36, backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.outlineVariant,
  },
});
