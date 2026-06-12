import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, Alert, Platform, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getTaskDetail, applyTask, getMyJobsAsWorker } from '../../api/tasks';
import { COLORS, SHADOWS, SIZES, TYPO, FRAGMENTS } from '../../theme/colors';

const CATEGORIES = [
  { id: 1, icon: require('../../../assets/images/icon_tutoring.png'), name: 'Gia sư', color: COLORS.primary },
  { id: 2, icon: require('../../../assets/images/icon_pickup.png'), name: 'Đón trẻ', color: COLORS.primary },
  { id: 3, icon: require('../../../assets/images/icon_cleaning.png'), name: 'Dọn dẹp', color: COLORS.primary },
  { id: 4, icon: require('../../../assets/images/icon_babysitting.png'), name: 'Trông trẻ', color: COLORS.primary },
  { id: 5, icon: require('../../../assets/images/icon_shopping.png'), name: 'Mua sắm hộ', color: COLORS.primary },
  { id: 6, icon: require('../../../assets/images/icon_cooking.png'), name: 'Nấu ăn', color: COLORS.primary },
  { id: 7, icon: require('../../../assets/images/icon_moving.png'), name: 'Chuyển đồ', color: COLORS.primary },
  { id: 8, icon: require('../../../assets/images/icon_other.png'), name: 'Khác', color: COLORS.primary },
];

export default function TaskDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { taskId } = route.params;
  const [task, setTask] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Sử dụng endpoint chi tiết task thay vì fetch ALL tasks
        const taskRes = await getTaskDetail(taskId);
        setTask(taskRes.data);

        // Kiểm tra xem carepartner đã ứng tuyển việc này chưa
        const jobsRes = await getMyJobsAsWorker();
        const alreadyApplied = jobsRes.data.some(job => job.task === taskId);
        setHasApplied(alreadyApplied);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [taskId]);

  const handleApply = () => {
    const startApply = async () => {
      setApplying(true);
      try {
        const res = await applyTask(taskId);
        setHasApplied(true);
        if (Platform.OS === 'web') {
          alert('✅ Thành công! Đã ứng tuyển!');
          navigation.navigate('MyJobs');
        } else {
          Alert.alert('✅ Thành công!', res.data.message || 'Đã ứng tuyển!', [
            { text: 'Xem việc của tôi', onPress: () => navigation.navigate('MyJobs') }
          ]);
        }
      } catch (e) {
        const msg = e.response?.data?.error || e.response?.data?.message || 'Thao tác thất bại.';
        if (Platform.OS === 'web') {
          alert(`Thông báo: ${msg}`);
        } else {
          Alert.alert('Thông báo', msg);
        }
      } finally {
        setApplying(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Bạn chắc chắn muốn ứng tuyển công việc này?')) {
        startApply();
      }
    } else {
      Alert.alert('Ứng tuyển ngay', 'Bạn chắc chắn muốn ứng tuyển công việc này?', [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Ứng tuyển', onPress: startApply },
      ]);
    }
  };


  if (isLoading) return <ActivityIndicator color={COLORS.primary} style={{ flex: 1, marginTop: 100 }} />;
  if (!task) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: COLORS.textMuted }}>Không tìm thấy công việc này.</Text>
    </View>
  );

  const cat = CATEGORIES.find(c => c.id === task.category) || CATEGORIES[7];

  const INFO_ITEMS = [
    { icon: 'calendar-outline', label: 'Thời gian', value: new Date(task.scheduled_time).toLocaleString('vi-VN'), color: COLORS.primary },
    { icon: 'location-outline', label: 'Địa điểm', value: task.location, color: COLORS.primary },
    { icon: 'person-outline', label: 'Phụ huynh', value: task.parent_name, color: COLORS.primary },
    { icon: 'cash-outline', label: 'Thù lao', value: `${parseInt(task.price).toLocaleString('vi-VN')}đ`, color: COLORS.primary },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chi tiết công việc</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.categoryTag}>
            <Image source={cat.icon} style={styles.catImage} resizeMode="contain" />
            <Text style={styles.categoryTagText}>{cat.name}</Text>
          </View>
          <Text style={styles.title}>{task.title}</Text>
          <Text style={styles.price}>{parseInt(task.price).toLocaleString('vi-VN')}đ</Text>
        </View>

        {/* Thông tin */}
        <View style={styles.infoGrid}>
          {INFO_ITEMS.map((item) => (
            <View key={item.label} style={styles.infoCard}>
              <View style={styles.infoIconCircle}>
                <Ionicons name={item.icon} size={20} color={item.color} />
              </View>
              <Text style={styles.infoLabel}>{item.label}</Text>
              <Text style={[styles.infoValue, item.label === 'Thù lao' && { color: COLORS.success, fontWeight: '900' }]}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>

        {/* Mô tả */}
        <View style={styles.descSection}>
          <Text style={styles.descTitle}>Yêu cầu chi tiết</Text>
          <Text style={styles.descText}>{task.description}</Text>
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.applyBtn,
            (applying || hasApplied) && styles.applyBtnDisabled,
          ]}
          onPress={handleApply}
          disabled={applying || hasApplied}
          activeOpacity={0.85}
        >
          {applying ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name={hasApplied ? "checkmark-circle" : "paper-plane"} size={20} color="#fff" />
              <Text style={styles.applyBtnText}>
                {hasApplied ? 'ĐÃ ỨNG TUYỂN' : 'ỨNG TUYỂN NGAY'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.surfaceAlt, justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.small,
  },
  headerTitle: { ...TYPO.h4, color: COLORS.textPrimary, fontWeight: '800' },
  body: { flex: 1 },
  // === HERO ===
  hero: {
    backgroundColor: COLORS.surfaceAlt, padding: 24,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10,
  },
  categoryTag: {
    alignSelf: 'flex-start',
    borderRadius: SIZES.radiusSm, paddingHorizontal: 12, paddingVertical: 6,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primaryLight,
    ...SHADOWS.small,
  },
  catImage: { width: 16, height: 16 },
  categoryTagText: { ...TYPO.caption, color: COLORS.primary },
  title: { ...TYPO.h2, color: COLORS.textPrimary },
  price: { ...TYPO.h1, fontSize: 28, color: COLORS.primary },
  // === INFO GRID ===
  infoGrid: { padding: SIZES.md, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoCard: {
    width: '47%', backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    padding: 14, gap: 8,
    ...SHADOWS.cardHover,
  },
  infoIconCircle: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt,
  },
  infoLabel: { ...TYPO.overline, color: COLORS.textMuted },
  infoValue: { ...TYPO.bodySmall, color: COLORS.textPrimary, fontWeight: '700' },
  // === DESCRIPTION ===
  descSection: {
    margin: SIZES.md, backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    padding: 18, gap: 10,
    ...SHADOWS.small,
    borderLeftWidth: 3, borderLeftColor: COLORS.primary,
  },
  descTitle: { ...TYPO.h4, color: COLORS.textPrimary, fontWeight: '900' },
  descText: { ...TYPO.body, color: COLORS.textSecondary },
  // === FOOTER ===
  footer: {
    padding: 20, paddingBottom: 36,
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  applyBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd, height: 56,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12,
    ...SHADOWS.large,
  },
  applyBtnDisabled: {
    backgroundColor: COLORS.textMuted, opacity: 0.6,
    shadowColor: 'transparent', elevation: 0,
    shadowOpacity: 0,
  },
  applyBtnText: { color: '#fff', ...TYPO.button, letterSpacing: 0.5 },
});
