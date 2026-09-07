// ============================================================
// JobTypeSelectScreen — Flow 1 Step 1: chọn 1 trong ĐÚNG 3 loại việc
// Spec: flow1-step1-parent-posting.md — UI tiếng Việt toàn bộ
// ============================================================

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';

const JOB_TYPES = [
  {
    type: 'tutoring',
    title: 'Gia sư',
    desc: 'Dạy kèm môn học hoặc kỹ năng (MC, vẽ, đàn, kỹ năng sống...)',
    icon: 'book',
    screen: 'TutoringForm',
  },
  {
    type: 'childcare',
    title: 'Trông trẻ',
    desc: 'Chăm sóc bé tại nhà: cho ăn, chơi cùng, hướng dẫn bài tập',
    icon: 'happy',
    screen: 'ChildcareForm',
  },
  {
    type: 'pickup',
    title: 'Đón trẻ',
    desc: 'Đón bé từ trường về nhà hoặc địa chỉ khác',
    icon: 'car',
    screen: 'PickupForm',
  },
];

export default function JobTypeSelectScreen() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <Text style={styles.heading}>Bạn cần gì?</Text>
      <Text style={styles.sub}>Chọn loại công việc để bắt đầu đăng</Text>
      {JOB_TYPES.map((item) => (
        <TouchableOpacity
          key={item.type}
          style={styles.card}
          activeOpacity={0.8}
          onPress={() => navigation.navigate(item.screen)}
        >
          <View style={styles.iconWrap}>
            <Ionicons name={item.icon} size={28} color={COLORS.primary} />
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardDesc}>{item.desc}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={COLORS.gray} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: SIZES.padding },
  heading: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginTop: 24 },
  sub: { fontSize: 14, color: COLORS.gray, marginTop: 6, marginBottom: 20 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: 16, padding: 18, marginBottom: 14, ...SHADOWS.small,
  },
  iconWrap: {
    width: 52, height: 52, borderRadius: 14, backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  textWrap: { flex: 1, marginLeft: 14, marginRight: 8 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  cardDesc: { fontSize: 13, color: COLORS.gray, marginTop: 3, lineHeight: 18 },
});
