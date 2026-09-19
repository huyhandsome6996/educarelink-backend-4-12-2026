// ============================================================
// TutoringAssessmentSection — Form đánh giá buổi học (Gia sư)
// CARE DIARY NÂNG CẤP — khớp API contract backend:
//   assessment_data = {
//     schema_version: 1,
//     lesson_content: { subject, topic, is_new_knowledge, is_review },
//     comprehension: { score(1-5), score_label, attitude },
//     classwork_homework: { classwork_status, homework },
//     remarks: { knowledge_gap, next_session_plan },
//   }
// Controlled component: nhận `value` (object) + onChange(nextData).
// Bắt buộc client-side: subject, topic, score, classwork_status.
// ============================================================

import React from 'react';
import {View, Text, StyleSheet, TextInput, TouchableOpacity} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {COLORS, TYPO} from '../../../theme/colors';

const SUBJECTS = ['Toán', 'Ngữ văn', 'Tiếng Anh', 'Vật Lý', 'Hóa học', 'Sinh học', 'Lịch sử', 'Địa lí', 'Tin học', 'Khác'];

export const SCORE_LABELS = {
  1: 'Chưa tiếp thu được',
  2: 'Cần hỗ trợ nhiều',
  3: 'Tiếp thu ở mức cơ bản',
  4: 'Hiểu bài nhanh',
  5: 'Tiếp thu xuất sắc',
};

const ATTITUDES = [
  'Rất tập trung, hăng hái',
  'Tập trung, hợp tác tốt',
  'Đôi lúc mất tập trung',
  'Mệt mỏi, ít tương tác',
];

export default function TutoringAssessmentSection({value, onChange}) {
  const data = value || {};
  const lesson = data.lesson_content || {};
  const comp = data.comprehension || {};
  const classwork = data.classwork_homework || {};
  const remarks = data.remarks || {};

  // patch(sub, {field: val}) — cập nhật 1 section rồi bắn onChange
  const patch = (section, fields) =>
    onChange({...data, [section]: {...(data[section] || {}), ...fields}});

  return (
    <View style={styles.wrap}>
      {/* ── Nội dung bài học ── */}
      <Text style={styles.sectionTitle}>
        <Ionicons name="book-outline" size={15} color={COLORS.primary} /> Nội dung bài học
      </Text>
      <View style={styles.chipWrap}>
        {SUBJECTS.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.chip, lesson.subject === s && styles.chipActive]}
            onPress={() => patch('lesson_content', {subject: s})}
            activeOpacity={0.7}>
            <Text style={[styles.chipText, lesson.subject === s && styles.chipTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={lesson.subject || ''}
        onChangeText={(v) => patch('lesson_content', {subject: v})}
        placeholder="Môn học (bắt buộc)" placeholderTextColor={COLORS.textMuted}
      />
      <TextInput
        style={styles.input}
        value={lesson.topic || ''}
        onChangeText={(v) => patch('lesson_content', {topic: v})}
        placeholder="Chủ đề bài học hôm nay (bắt buộc)" placeholderTextColor={COLORS.textMuted}
      />
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleChip, lesson.is_new_knowledge && styles.toggleChipActive]}
          onPress={() => patch('lesson_content', {is_new_knowledge: !lesson.is_new_knowledge, is_review: false})}
          activeOpacity={0.7}>
          <Text style={[styles.toggleChipText, lesson.is_new_knowledge && styles.toggleChipTextActive]}>Kiến thức mới</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleChip, lesson.is_review && styles.toggleChipActive]}
          onPress={() => patch('lesson_content', {is_review: !lesson.is_review, is_new_knowledge: false})}
          activeOpacity={0.7}>
          <Text style={[styles.toggleChipText, lesson.is_review && styles.toggleChipTextActive]}>Ôn tập</Text>
        </TouchableOpacity>
      </View>

      {/* ── Mức độ tiếp thu (thang sao 1-5 kèm nhãn) ── */}
      <Text style={styles.sectionTitle}>
        <Ionicons name="star-outline" size={15} color={COLORS.primary} /> Mức độ tiếp thu bài
      </Text>
      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity
            key={n}
            onPress={() => patch('comprehension', {score: n, score_label: SCORE_LABELS[n]})}
            activeOpacity={0.7}
            style={styles.starBtn}>
            <Ionicons
              name={comp.score >= n ? 'star' : 'star-outline'}
              size={30}
              color={comp.score >= n ? '#F59E0B' : COLORS.outlineVariant}
            />
          </TouchableOpacity>
        ))}
      </View>
      {comp.score ? (
        <Text style={styles.scoreLabel}>{SCORE_LABELS[comp.score] || comp.score_label || ''}</Text>
      ) : null}
      <View style={styles.chipWrap}>
        {ATTITUDES.map((a) => (
          <TouchableOpacity
            key={a}
            style={[styles.chip, comp.attitude === a && styles.chipActive]}
            onPress={() => patch('comprehension', {attitude: a})}
            activeOpacity={0.7}>
            <Text style={[styles.chipText, comp.attitude === a && styles.chipTextActive]}>{a}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={comp.attitude || ''}
        onChangeText={(v) => patch('comprehension', {attitude: v})}
        placeholder="Thái độ buổi học (tuỳ chọn)" placeholderTextColor={COLORS.textMuted}
      />

      {/* ── Bài tập trên lớp & về nhà ── */}
      <Text style={styles.sectionTitle}>
        <Ionicons name="pencil-outline" size={15} color={COLORS.primary} /> Bài tập trên lớp &amp; về nhà
      </Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={classwork.classwork_status || ''}
        onChangeText={(v) => patch('classwork_homework', {classwork_status: v})}
        placeholder="Tình trạng bài tập trên lớp (bắt buộc) — VD: Đã giải 10 bài SGK"
        placeholderTextColor={COLORS.textMuted}
        multiline numberOfLines={2} textAlignVertical="top"
      />
      <TextInput
        style={[styles.input, styles.multiline]}
        value={classwork.homework || ''}
        onChangeText={(v) => patch('classwork_homework', {homework: v})}
        placeholder="Bài tập về nhà (tuỳ chọn) — VD: Trang 45-46, bài 1-5 / Không có"
        placeholderTextColor={COLORS.textMuted}
        multiline numberOfLines={2} textAlignVertical="top"
      />

      {/* ── Nhận xét & kế hoạch ── */}
      <Text style={styles.sectionTitle}>
        <Ionicons name="bulb-outline" size={15} color={COLORS.primary} /> Nhận xét &amp; kế hoạch buổi tới
      </Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={remarks.knowledge_gap || ''}
        onChangeText={(v) => patch('remarks', {knowledge_gap: v})}
        placeholder="Lỗ hổng kiến thức cần khắc phục (tuỳ chọn)"
        placeholderTextColor={COLORS.textMuted}
        multiline numberOfLines={2} textAlignVertical="top"
      />
      <TextInput
        style={[styles.input, styles.multiline]}
        value={remarks.next_session_plan || ''}
        onChangeText={(v) => patch('remarks', {next_session_plan: v})}
        placeholder="Kế hoạch cho buổi học tới (tuỳ chọn)"
        placeholderTextColor={COLORS.textMuted}
        multiline numberOfLines={2} textAlignVertical="top"
      />
    </View>
  );
}

// Validate client-side — khớp 100% với backend (Phase 2) để tránh
// round-trip 400 vô nghĩa. Trả về chuỗi lỗi đầu tiên hoặc null.
export function validateTutoringAssessment(data) {
  const d = data || {};
  const lesson = d.lesson_content || {};
  const comp = d.comprehension || {};
  const classwork = d.classwork_homework || {};
  if (!String(lesson.subject || '').trim()) return 'Vui lòng nhập môn học.';
  if (!String(lesson.topic || '').trim()) return 'Vui lòng nhập chủ đề bài học.';
  const score = Number(comp.score);
  if (!comp.score || Number.isNaN(score) || score < 1 || score > 5) {
    return 'Vui lòng chọn mức độ tiếp thu từ 1 đến 5 sao.';
  }
  if (!String(classwork.classwork_status || '').trim()) {
    return 'Vui lòng nhập tình trạng bài tập trên lớp.';
  }
  return null;
}

const styles = StyleSheet.create({
  wrap: {gap: 8},
  sectionTitle: {...TYPO.h4, color: COLORS.onSurface, marginTop: 10, marginBottom: 4},
  chipWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4},
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: COLORS.surfaceContainerLow, borderWidth: 1, borderColor: COLORS.outlineVariant,
  },
  chipActive: {backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary},
  chipText: {fontSize: 12, fontWeight: '600', color: COLORS.onSurfaceVariant},
  chipTextActive: {color: COLORS.primary},
  toggleRow: {flexDirection: 'row', gap: 10, marginBottom: 4},
  toggleChip: {
    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLow, borderWidth: 1, borderColor: COLORS.outlineVariant,
  },
  toggleChipActive: {backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary},
  toggleChipText: {fontSize: 13, fontWeight: '600', color: COLORS.onSurfaceVariant},
  toggleChipTextActive: {color: COLORS.primary},
  starRow: {flexDirection: 'row', gap: 6, marginBottom: 2},
  starBtn: {padding: 2},
  scoreLabel: {...TYPO.bodySmall, color: '#F59E0B', fontWeight: '700', marginBottom: 4},
  input: {
    backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.outlineVariant,
    paddingHorizontal: 14, paddingVertical: 12, ...TYPO.body, color: COLORS.onSurface, marginBottom: 6,
  },
  multiline: {minHeight: 64, textAlignVertical: 'top'},
});
