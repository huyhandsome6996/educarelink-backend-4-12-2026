// ============================================================
// CareDiaryDetailScreen — MỚI (Nhóm B, mock data)
// Hiển thị chi tiết nhật ký chăm sóc do CarePartner tạo sau khi làm việc.
// Chưa có backend → dùng mock data tĩnh.
// Khi có API: thay MOCK_DIARY bằng getCareDiary(taskId) trong useEffect.
//
// Layout theo design HTML care_diary_detail/code.html:
// - Top App Bar: surfaceContainerLow bg, back + 'Chi tiết nhật ký' + spacer
// - CarePartner card: surface-container bg, avatar 64px + name + date +
//   verified badge
// - Bento grid 2 cột: Tâm trạng bé (icon + text) + Mức độ hoàn thành
//   (progress bar 85% + 3 stat boxes)
// - Timeline hoạt động đã teach (vertical timeline với check icons)
// - Ghi chú thêm + ảnh đính kèm
// - Sticky footer: 'Gửi phản hồi' button (showComingSoon)
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Image, FlatList, Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';
import { showComingSoon } from '../../utils/comingSoon';
import { MOCK_DIARY } from '../../mocks/careDiaryMock';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STATUS_STYLE = {
  done: { icon: 'checkmark', color: COLORS.secondary, border: COLORS.secondary, label: 'Hoàn thành' },
  partial: { icon: 'ellipse', color: COLORS.primary, border: COLORS.primary, label: 'Một phần' },
  skipped: { icon: 'close', color: COLORS.onSurfaceVariant, border: COLORS.outline, label: 'Bỏ qua' },
};

export default function CareDiaryDetailScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [diary] = useState(MOCK_DIARY);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceContainerLow} />

      {/* Top App Bar */}
      <View style={[styles.appBar, { paddingTop: insets.top + 32 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.appBarBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
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
            <View style={styles.cpVerifiedBadge}>
              <Ionicons name="shield-checkmark" size={12} color={COLORS.onSecondaryContainer} />
            </View>
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
            <Text style={styles.moodNote}>{diary.mood.note}</Text>
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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hoạt động đã teach</Text>
          <View style={styles.timeline}>
            {diary.activities.map((act, idx) => {
              const st = STATUS_STYLE[act.status];
              return (
                <View key={idx} style={styles.timelineItem}>
                  {/* Timeline dot + line */}
                  <View style={styles.timelineLeft}>
                    <View style={[styles.timelineDot, { borderColor: st.border }]}>
                      <Ionicons name={st.icon} size={14} color={st.color} />
                    </View>
                    {idx < diary.activities.length - 1 && <View style={styles.timelineLine} />}
                  </View>

                  {/* Activity card */}
                  <View style={styles.activityCard}>
                    <View style={styles.activityHeader}>
                      <Text style={styles.activityTime}>{act.time}</Text>
                      <View style={[styles.activityStatusChip, { backgroundColor: st.color + '20' }]}>
                        <Text style={[styles.activityStatusText, { color: st.color }]}>{st.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.activityTitle}>{act.title}</Text>
                    <Text style={styles.activityDesc}>{act.desc}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Note section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ghi chú thêm</Text>
          <View style={styles.noteCard}>
            <Ionicons name="chatbubble-ellipses" size={18} color={COLORS.primary} style={styles.noteIcon} />
            <Text style={styles.noteText}>{diary.note}</Text>
          </View>
        </View>

        {/* Attachments */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ảnh đính kèm ({diary.attachments.length})</Text>
          <View style={styles.attachmentRow}>
            {diary.attachments.map((att) => (
              <TouchableOpacity
                key={att.id}
                style={[styles.attachmentBox, { backgroundColor: att.color }]}
                onPress={() => showComingSoon('Xem ảnh đính kèm')}
                activeOpacity={0.85}
              >
                <Ionicons name="image" size={28} color={COLORS.onSurface} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.attachmentAdd}
              onPress={() => showComingSoon('Thêm ảnh')}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={24} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.feedbackBtn}
          onPress={() => showComingSoon('Gửi phản hồi nhật ký')}
          activeOpacity={0.85}
        >
          <Ionicons name="chatbubble-outline" size={18} color={COLORS.primary} />
          <Text style={styles.feedbackBtnText}>Gửi phản hồi</Text>
        </TouchableOpacity>
      </View>
    </View>
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
    backgroundColor: COLORS.surfaceContainerLow,
  },
  appBarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appBarTitle: {
    ...TYPO.h2,
    color: COLORS.primary,
    flex: 1,
    textAlign: 'center',
    marginRight: 44, // cân chỉnh với spacer
  },
  // === SCROLL ===
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 24 },
  // === CAREPARTNER CARD ===
  cpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...SHADOWS.small,
  },
  cpAvatarBox: {
    position: 'relative',
  },
  cpAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cpAvatarText: {
    ...TYPO.h2,
    color: '#fff',
  },
  cpVerifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.secondaryContainer,
    borderWidth: 2,
    borderColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cpInfo: { flex: 1 },
  cpName: {
    ...TYPO.h3,
    color: COLORS.onSurface,
    marginBottom: 2,
  },
  cpRole: {
    ...TYPO.caption,
    color: COLORS.secondaryDark,
    fontWeight: '700',
  },
  cpDate: {
    ...TYPO.body,
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  // === BENTO GRID ===
  bentoGrid: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  moodCard: {
    width: '48%',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    alignItems: 'center',
    gap: 8,
    ...SHADOWS.small,
  },
  completionCard: {
    width: '48%',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...SHADOWS.small,
  },
  cardTitle: {
    ...TYPO.h4,
    color: COLORS.onSurface,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  // Mood
  moodIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  moodLabel: {
    ...TYPO.h3,
    color: COLORS.primary,
    textAlign: 'center',
  },
  moodNote: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 16,
  },
  // Completion
  completionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 8,
  },
  completionPercent: {
    ...TYPO.h1,
    color: COLORS.secondary,
    fontSize: 32,
  },
  completionUnit: {
    ...TYPO.body,
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    paddingBottom: 4,
  },
  progressBar: {
    width: '100%',
    height: 14,
    backgroundColor: COLORS.surfaceContainerHigh,
    borderRadius: 7,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.secondaryContainer,
    borderRadius: 7,
  },
  completionStatsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: 8,
    padding: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  statValue: {
    ...TYPO.h4,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 9,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 2,
  },
  // === SECTIONS ===
  section: {
    gap: 12,
  },
  sectionTitle: {
    ...TYPO.h4,
    color: COLORS.onSurface,
  },
  // === TIMELINE ===
  timeline: {
    gap: 0,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 12,
  },
  timelineLeft: {
    alignItems: 'center',
    width: 32,
  },
  timelineDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: COLORS.outlineVariant,
    marginTop: 4,
    marginBottom: 4,
    minHeight: 24,
  },
  activityCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    marginBottom: 12,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  activityTime: {
    ...TYPO.caption,
    color: COLORS.primary,
    fontWeight: '700',
  },
  activityStatusChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  activityStatusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  activityTitle: {
    ...TYPO.h4,
    color: COLORS.onSurface,
    fontSize: 15,
    marginBottom: 4,
  },
  activityDesc: {
    ...TYPO.body,
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    lineHeight: 18,
  },
  // === NOTE ===
  noteCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
  },
  noteIcon: {
    marginTop: 2,
  },
  noteText: {
    flex: 1,
    ...TYPO.body,
    fontSize: 14,
    color: COLORS.onSurface,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  // === ATTACHMENTS ===
  attachmentRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  attachmentBox: {
    width: 100,
    height: 100,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  attachmentAdd: {
    width: 100,
    height: 100,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.outlineVariant,
    borderStyle: 'dashed',
    backgroundColor: COLORS.surfaceContainerLow,
  },
  // === FOOTER ===
  footer: {
    padding: 20,
    paddingBottom: 36,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
  },
  feedbackBtn: {
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: 14,
    height: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  feedbackBtnText: {
    ...TYPO.h4,
    color: COLORS.primary,
  },
});
