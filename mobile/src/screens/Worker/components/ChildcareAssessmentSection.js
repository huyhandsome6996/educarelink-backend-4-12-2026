// ============================================================
// ChildcareAssessmentSection — Form sinh hoạt (Trông trẻ)
// CARE DIARY NÂNG CẤP — khớp API contract backend:
//   assessment_data = {
//     schema_version: 1,
//     meals: [{ time, meal, amount }],        // ≥1 dòng bắt buộc
//     nap: { start_time, end_time, quality }, // quality bắt buộc
//     hygiene_health: { diaper_toilet, physical_condition }, // physical bắt buộc
//     activities: { list: [..], mood_during }, // list rỗng vẫn hợp lệ
//     notes_for_parents: '',
//   }
// Controlled component: nhận `value` (object) + onChange(nextData).
// ============================================================

import React from 'react';
import {View, Text, StyleSheet, TextInput, TouchableOpacity} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {COLORS, TYPO} from '../../../theme/colors';

export default function ChildcareAssessmentSection({value, onChange}) {
  const data = value || {};
  const meals = Array.isArray(data.meals) ? data.meals : [];
  const nap = data.nap || {};
  const hygiene = data.hygiene_health || {};
  const activities = data.activities || {};
  const actList = Array.isArray(activities.list) ? activities.list : [];

  const patch = (section, fields) =>
    onChange({...data, [section]: {...(data[section] || {}), ...fields}});

  const patchTop = (fields) => onChange({...data, ...fields});

  const updateMeal = (idx, field, val) => {
    const next = meals.map((m, i) => (i === idx ? {...m, [field]: val} : m));
    patchTop({meals: next});
  };
  const addMeal = () => patchTop({meals: [...meals, {time: '', meal: '', amount: ''}]});
  const removeMeal = (idx) => patchTop({meals: meals.filter((_, i) => i !== idx)});

  const updateActivity = (idx, val) => {
    patch('activities', {list: actList.map((a, i) => (i === idx ? val : a))});
  };
  const addActivity = () => patch('activities', {list: [...actList, '']});
  const removeActivity = (idx) =>
    patch('activities', {list: actList.filter((_, i) => i !== idx)});

  return (
    <View style={styles.wrap}>
      {/* ── Bữa ăn (thêm được nhiều dòng) ── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          <Ionicons name="restaurant-outline" size={15} color={COLORS.primary} /> Bữa ăn
        </Text>
        <TouchableOpacity onPress={addMeal} style={styles.addBtn} activeOpacity={0.7}>
          <Ionicons name="add" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
      {meals.length === 0 && (
        <Text style={styles.hint}>Nhấn “+” để thêm bữa ăn (ít nhất 1 bữa).</Text>
      )}
      {meals.map((m, idx) => (
        <View key={idx} style={styles.mealCard}>
          <View style={styles.mealRowTop}>
            <TextInput
              style={styles.timeInput} value={m.time || ''}
              onChangeText={(v) => updateMeal(idx, 'time', v)}
              placeholder="Giờ" placeholderTextColor={COLORS.textMuted} maxLength={5}
            />
            <TextInput
              style={styles.mealInput} value={m.meal || ''}
              onChangeText={(v) => updateMeal(idx, 'meal', v)}
              placeholder="Món ăn (VD: Cơm trưa + canh rau)" placeholderTextColor={COLORS.textMuted}
            />
            <TouchableOpacity onPress={() => removeMeal(idx)} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Ionicons name="close-circle" size={20} color={COLORS.error} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input} value={m.amount || ''}
            onChangeText={(v) => updateMeal(idx, 'amount', v)}
            placeholder="Lượng ăn (VD: Ăn hết suất / Uống 200ml)" placeholderTextColor={COLORS.textMuted}
          />
        </View>
      ))}

      {/* ── Giấc ngủ ── */}
      <Text style={styles.sectionTitle}>
        <Ionicons name="bed-outline" size={15} color={COLORS.primary} /> Giấc ngủ
      </Text>
      <View style={styles.timeRow}>
        <TextInput
          style={[styles.timeInput, styles.flex1]} value={nap.start_time || ''}
          onChangeText={(v) => patch('nap', {start_time: v})}
          placeholder="Bắt đầu (12:30)" placeholderTextColor={COLORS.textMuted} maxLength={5}
        />
        <TextInput
          style={[styles.timeInput, styles.flex1]} value={nap.end_time || ''}
          onChangeText={(v) => patch('nap', {end_time: v})}
          placeholder="Kết thúc (14:15)" placeholderTextColor={COLORS.textMuted} maxLength={5}
        />
      </View>
      <TextInput
        style={styles.input} value={nap.quality || ''}
        onChangeText={(v) => patch('nap', {quality: v})}
        placeholder="Chất lượng giấc ngủ (bắt buộc) — VD: Ngủ ngon, sâu giấc"
        placeholderTextColor={COLORS.textMuted}
      />

      {/* ── Vệ sinh & thể chất ── */}
      <Text style={styles.sectionTitle}>
        <Ionicons name="medkit-outline" size={15} color={COLORS.primary} /> Vệ sinh &amp; thể chất
      </Text>
      <TextInput
        style={styles.input} value={hygiene.diaper_toilet || ''}
        onChangeText={(v) => patch('hygiene_health', {diaper_toilet: v})}
        placeholder="Vệ sinh / đi vệ sinh (tuỳ chọn)" placeholderTextColor={COLORS.textMuted}
      />
      <TextInput
        style={styles.input} value={hygiene.physical_condition || ''}
        onChangeText={(v) => patch('hygiene_health', {physical_condition: v})}
        placeholder="Tình trạng thể chất (bắt buộc) — VD: Nhiệt độ bình thường, tỉnh táo"
        placeholderTextColor={COLORS.textMuted}
      />

      {/* ── Hoạt động (thêm được nhiều dòng, không bắt buộc) ── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          <Ionicons name="toys-outline" size={15} color={COLORS.primary} /> Hoạt động
        </Text>
        <TouchableOpacity onPress={addActivity} style={styles.addBtn} activeOpacity={0.7}>
          <Ionicons name="add" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
      {actList.map((a, idx) => (
        <View key={idx} style={styles.activityRow}>
          <TextInput
            style={[styles.input, styles.flex1]} value={a}
            onChangeText={(v) => updateActivity(idx, v)}
            placeholder="Hoạt động (VD: Đọc truyện)" placeholderTextColor={COLORS.textMuted}
          />
          <TouchableOpacity onPress={() => removeActivity(idx)} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Ionicons name="close-circle" size={20} color={COLORS.error} />
          </TouchableOpacity>
        </View>
      ))}
      <TextInput
        style={styles.input} value={activities.mood_during || ''}
        onChangeText={(v) => patch('activities', {mood_during: v})}
        placeholder="Tâm trạng trong lúc chơi (tuỳ chọn)" placeholderTextColor={COLORS.textMuted}
      />

      {/* ── Ghi chú cho phụ huynh ── */}
      <Text style={styles.sectionTitle}>
        <Ionicons name="chatbubble-ellipses-outline" size={15} color={COLORS.primary} /> Ghi chú cho phụ huynh
      </Text>
      <TextInput
        style={[styles.input, styles.multiline]} value={data.notes_for_parents || ''}
        onChangeText={(v) => patchTop({notes_for_parents: v})}
        placeholder="Lưu ý gửi phụ huynh (tuỳ chọn)" placeholderTextColor={COLORS.textMuted}
        multiline numberOfLines={3} textAlignVertical="top"
      />
    </View>
  );
}

// Validate client-side — khớp 100% với backend (Phase 2).
export function validateChildcareAssessment(data) {
  const d = data || {};
  const meals = Array.isArray(d.meals) ? d.meals : [];
  if (meals.length === 0) return 'Vui lòng thêm ít nhất 1 bữa ăn.';
  for (let i = 0; i < meals.length; i++) {
    const m = meals[i] || {};
    if (!String(m.time || '').trim() || !String(m.amount || '').trim()) {
      return `Bữa ăn thứ ${i + 1} thiếu giờ hoặc lượng ăn.`;
    }
  }
  const nap = d.nap || {};
  if (!String(nap.quality || '').trim()) return 'Vui lòng nhập chất lượng giấc ngủ của bé.';
  const hygiene = d.hygiene_health || {};
  if (!String(hygiene.physical_condition || '').trim()) {
    return 'Vui lòng nhập tình trạng thể chất của bé.';
  }
  return null;
}

const styles = StyleSheet.create({
  wrap: {gap: 8},
  sectionHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  sectionTitle: {...TYPO.h4, color: COLORS.onSurface, marginTop: 10, marginBottom: 4},
  hint: {...TYPO.caption, color: COLORS.textMuted, marginBottom: 4},
  addBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  mealCard: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: COLORS.outlineVariant, marginBottom: 6, gap: 8,
  },
  mealRowTop: {flexDirection: 'row', alignItems: 'center', gap: 8},
  timeRow: {flexDirection: 'row', gap: 8},
  timeInput: {
    width: 92, backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.outlineVariant, paddingHorizontal: 10, paddingVertical: 10,
    ...TYPO.bodySmall, color: COLORS.onSurface, textAlign: 'center',
  },
  mealInput: {flex: 1, backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.outlineVariant, paddingHorizontal: 12, paddingVertical: 10, ...TYPO.bodySmall, color: COLORS.onSurface},
  flex1: {flex: 1, width: undefined},
  activityRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  input: {
    backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.outlineVariant,
    paddingHorizontal: 14, paddingVertical: 12, ...TYPO.body, color: COLORS.onSurface, marginBottom: 6,
  },
  multiline: {minHeight: 64, textAlignVertical: 'top'},
});
