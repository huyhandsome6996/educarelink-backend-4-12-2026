// ============================================================
// ChildcareAssessmentCard — Card sinh hoạt (chi tiết nhật ký Trông trẻ)
// CARE DIARY NÂNG CẤP — hiển thị assessment_data theo contract:
//   meals (icon bữa ăn), nap (giấc ngủ), hygiene_health (vệ sinh),
//   activities (danh sách + tâm trạng), notes_for_parents.
// Dùng chung cho CareDiaryDetailScreen (parent + worker stack).
// ============================================================

import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {COLORS, SHADOWS, TYPO} from '../theme/colors';

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

export default function ChildcareAssessmentCard({data}) {
  const d = data || {};
  const meals = Array.isArray(d.meals) ? d.meals : [];
  const nap = d.nap || {};
  const hygiene = d.hygiene_health || {};
  const activities = d.activities || {};
  const actList = Array.isArray(activities.list) ? activities.list.filter(Boolean) : [];

  const napTime = [nap.start_time, nap.end_time].filter(Boolean).join(' → ');

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="heart" size={18} color={COLORS.primary} />
        <Text style={styles.headerTitle}>Sinh hoạt trong buổi trông trẻ</Text>
      </View>

      {/* Bữa ăn */}
      {meals.length > 0 && (
        <View style={styles.subBox}>
          <Text style={styles.subTitle}>
            <Ionicons name="restaurant" size={13} color={COLORS.primary} /> Bữa ăn
          </Text>
          {meals.map((m, idx) => (
            <View key={idx} style={styles.mealRow}>
              <View style={styles.timePill}>
                <Text style={styles.timePillText}>{m.time || '--:--'}</Text>
              </View>
              <View style={styles.mealBody}>
                {m.meal ? <Text style={styles.mealName}>{m.meal}</Text> : null}
                {m.amount ? <Text style={styles.mealAmount}>{m.amount}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Giấc ngủ */}
      {(napTime || nap.quality) && (
        <View style={styles.subBox}>
          <Text style={styles.subTitle}>
            <Ionicons name="bed" size={13} color={COLORS.primary} /> Giấc ngủ
          </Text>
          {napTime ? <Text style={styles.subValue}>⏰ {napTime}</Text> : null}
          {nap.quality ? <Text style={styles.subValue}>{nap.quality}</Text> : null}
        </View>
      )}

      <Row icon="medkit-outline" label="Vệ sinh / đi vệ sinh" value={hygiene.diaper_toilet} />
      <Row icon="fitness-outline" label="Tình trạng thể chất" value={hygiene.physical_condition} />

      {/* Hoạt động */}
      {(actList.length > 0 || activities.mood_during) && (
        <View style={styles.subBox}>
          <Text style={styles.subTitle}>
            <Ionicons name="toys" size={13} color={COLORS.primary} /> Hoạt động
          </Text>
          <View style={styles.activityWrap}>
            {actList.map((a, idx) => (
              <View key={idx} style={styles.activityChip}>
                <Text style={styles.activityChipText}>{a}</Text>
              </View>
            ))}
          </View>
          {activities.mood_during ? (
            <Text style={styles.subValue}>Tâm trạng: {activities.mood_during}</Text>
          ) : null}
        </View>
      )}

      {/* Ghi chú cho phụ huynh */}
      {d.notes_for_parents ? (
        <View style={styles.noteBox}>
          <Ionicons name="chatbubble-ellipses" size={16} color={COLORS.primary} />
          <Text style={styles.noteText}>{d.notes_for_parents}</Text>
        </View>
      ) : null}
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
  subBox: {
    backgroundColor: COLORS.surfaceContainerLow, borderRadius: 14,
    padding: 12, borderWidth: 1, borderColor: COLORS.outlineVariant, gap: 8,
  },
  subTitle: {...TYPO.caption, color: COLORS.onSurface, fontWeight: '800'},
  subValue: {...TYPO.bodySmall, color: COLORS.onSurface, lineHeight: 19},
  mealRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  timePill: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    backgroundColor: COLORS.primaryLight, borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  timePillText: {fontSize: 11, fontWeight: '800', color: COLORS.primary},
  mealBody: {flex: 1},
  mealName: {...TYPO.bodySmall, color: COLORS.onSurface, fontWeight: '700'},
  mealAmount: {...TYPO.caption, color: COLORS.onSurfaceVariant},
  activityWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  activityChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.outlineVariant,
  },
  activityChipText: {fontSize: 12, fontWeight: '600', color: COLORS.onSurface},
  noteBox: {
    flexDirection: 'row', gap: 10, backgroundColor: COLORS.primaryLight,
    borderRadius: 14, padding: 12, borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  noteText: {flex: 1, ...TYPO.bodySmall, color: COLORS.onSurface, lineHeight: 19, fontStyle: 'italic'},
  row: {flexDirection: 'row', gap: 10},
  rowIcon: {marginTop: 2},
  rowBody: {flex: 1},
  rowLabel: {...TYPO.caption, color: COLORS.onSurfaceVariant, fontWeight: '700'},
  rowValue: {...TYPO.bodySmall, color: COLORS.onSurface, lineHeight: 19, marginTop: 1},
});
