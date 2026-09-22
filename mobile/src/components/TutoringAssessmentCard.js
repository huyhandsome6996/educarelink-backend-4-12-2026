// ============================================================
// TutoringAssessmentCard — Card học tập (chi tiết nhật ký Gia sư)
// CARE DIARY NÂNG CẤP — hiển thị assessment_data theo contract:
//   lesson_content (môn + chủ đề + mới/ôn), comprehension (sao 1-5,
//   thái độ), classwork_homework, remarks.
// Dùng chung cho CareDiaryDetailScreen (parent + worker stack).
// ============================================================

import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {COLORS, SHADOWS, TYPO} from '../theme/colors';

const SCORE_LABELS = {
  1: 'Chưa tiếp thu được',
  2: 'Cần hỗ trợ nhiều',
  3: 'Tiếp thu ở mức cơ bản',
  4: 'Hiểu bài nhanh',
  5: 'Tiếp thu xuất sắc',
};

function Row({icon, label, value}) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={15} color={COLORS.primary} style={styles.rowIcon} />
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function TutoringAssessmentCard({data}) {
  const d = data || {};
  const lesson = d.lesson_content || {};
  const comp = d.comprehension || {};
  const classwork = d.classwork_homework || {};
  const remarks = d.remarks || {};
  const score = Number(comp.score) || 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="school" size={18} color={COLORS.primary} />
        <Text style={styles.headerTitle}>Đánh giá buổi học</Text>
      </View>

      {/* Môn học + chủ đề */}
      <View style={styles.subjectBox}>
        <Text style={styles.subject}>{lesson.subject || '—'}</Text>
        {lesson.topic ? <Text style={styles.topic}>{lesson.topic}</Text> : null}
        {(lesson.is_new_knowledge || lesson.is_review) && (
          <View style={styles.badgeRow}>
            {!!lesson.is_new_knowledge && (
              <View style={[styles.badge, styles.badgeGreen]}>
                <Text style={styles.badgeTextGreen}>Kiến thức mới</Text>
              </View>
            )}
            {!!lesson.is_review && (
              <View style={[styles.badge, styles.badgeBlue]}>
                <Text style={styles.badgeTextBlue}>Ôn tập</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Mức độ tiếp thu — sao + nhãn */}
      <View style={styles.scoreBox}>
        <Text style={styles.scoreTitle}>Mức độ tiếp thu bài</Text>
        <View style={styles.starRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Ionicons
              key={n}
              name={score >= n ? 'star' : 'star-outline'}
              size={24}
              color={score >= n ? '#F59E0B' : COLORS.outlineVariant}
              style={styles.star}
            />
          ))}
        </View>
        <Text style={styles.scoreLabel}>
          {comp.score_label || SCORE_LABELS[score] || ''}
        </Text>
        {comp.attitude ? <Text style={styles.attitude}>{comp.attitude}</Text> : null}
      </View>

      <Row icon="pencil" label="Bài tập trên lớp" value={classwork.classwork_status} />
      <Row icon="home" label="Bài tập về nhà" value={classwork.homework} />
      <Row icon="alert-circle-outline" label="Lỗ hổng kiến thức" value={remarks.knowledge_gap} />
      <Row icon="calendar-outline" label="Kế hoạch buổi tới" value={remarks.next_session_plan} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface, borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: COLORS.outlineVariant, gap: 12, ...SHADOWS.small,
  },
  header: {flexDirection: 'row', alignItems: 'center', gap: 8},
  headerTitle: {...TYPO.h4, color: COLORS.onSurface, flex: 1},
  subjectBox: {
    backgroundColor: COLORS.primaryLight, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  subject: {...TYPO.h3, color: COLORS.primary},
  topic: {...TYPO.bodySmall, color: COLORS.onSurface, marginTop: 2},
  badgeRow: {flexDirection: 'row', gap: 8, marginTop: 8},
  badge: {paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999},
  badgeGreen: {backgroundColor: '#DCFCE7'},
  badgeBlue: {backgroundColor: '#DBEAFE'},
  badgeTextGreen: {fontSize: 11, fontWeight: '700', color: '#15803D'},
  badgeTextBlue: {fontSize: 11, fontWeight: '700', color: '#1D4ED8'},
  scoreBox: {
    backgroundColor: COLORS.surfaceContainerLow, borderRadius: 14,
    padding: 12, borderWidth: 1, borderColor: COLORS.outlineVariant,
    alignItems: 'center', gap: 4,
  },
  scoreTitle: {...TYPO.caption, color: COLORS.onSurfaceVariant, fontWeight: '700'},
  starRow: {flexDirection: 'row'},
  star: {marginHorizontal: 2},
  scoreLabel: {...TYPO.bodySmall, color: '#F59E0B', fontWeight: '800'},
  attitude: {...TYPO.caption, color: COLORS.onSurfaceVariant, textAlign: 'center', fontStyle: 'italic'},
  row: {flexDirection: 'row', gap: 10},
  rowIcon: {marginTop: 2},
  rowBody: {flex: 1},
  rowLabel: {...TYPO.caption, color: COLORS.onSurfaceVariant, fontWeight: '700'},
  rowValue: {...TYPO.bodySmall, color: COLORS.onSurface, lineHeight: 19, marginTop: 1},
});
