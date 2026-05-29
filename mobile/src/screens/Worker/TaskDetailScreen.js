import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, Alert, Platform, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getAllTasks, applyTask, getMyJobsAsWorker } from '../../api/tasks';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';

const CATEGORIES = [
  { id: 1, icon: require('../../../assets/images/icon_tutoring.png'), name: 'Gia sư', color: '#FF6B35' },
  { id: 2, icon: require('../../../assets/images/icon_pickup.png'), name: 'Đón trẻ', color: '#3B82F6' },
  { id: 3, icon: require('../../../assets/images/icon_cleaning.png'), name: 'Dọn dẹp', color: '#10B981' },
  { id: 4, icon: require('../../../assets/images/icon_babysitting.png'), name: 'Trông trẻ', color: '#F59E0B' },
  { id: 5, icon: require('../../../assets/images/icon_shopping.png'), name: 'Mua sắm hộ', color: '#8B5CF6' },
  { id: 6, icon: require('../../../assets/images/icon_cooking.png'), name: 'Nấu ăn', color: '#EF4444' },
  { id: 7, icon: require('../../../assets/images/icon_moving.png'), name: 'Chuyển đồ', color: '#06B6D4' },
  { id: 8, icon: require('../../../assets/images/icon_other.png'), name: 'Khác', color: '#6B7280' },
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
        const tasksRes = await getAllTasks();
        const foundTask = tasksRes.data.find(t => t.id === taskId);
        setTask(foundTask);

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
    { icon: 'calendar-outline', label: 'Thời gian', value: new Date(task.scheduled_time).toLocaleString('vi-VN'), color: COLORS.info },
    { icon: 'location-outline', label: 'Địa điểm', value: task.location, color: COLORS.secondary },
    { icon: 'person-outline', label: 'Phụ huynh', value: task.parent_name, color: COLORS.warning },
    { icon: 'cash-outline', label: 'Thù lao', value: `${parseInt(task.price).toLocaleString('vi-VN')}đ`, color: COLORS.success },
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
          <View style={[styles.categoryTag, { backgroundColor: cat.color + '15' }]}>
            <Image source={cat.icon} style={styles.catImage} resizeMode="contain" />
            <Text style={[styles.categoryTagText, { color: cat.color }]}>{cat.name}</Text>
          </View>
          <Text style={styles.title}>{task.title}</Text>
          <Text style={styles.price}>{parseInt(task.price).toLocaleString('vi-VN')}đ</Text>
        </View>

        {/* Thông tin */}
        <View style={styles.infoGrid}>
          {INFO_ITEMS.map((item) => (
            <View key={item.label} style={styles.infoCard}>
              <View style={[styles.infoIconCircle, { backgroundColor: item.color + '15' }]}>
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
    backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  body: { flex: 1 },
  // === HERO ===
  hero: {
    backgroundColor: COLORS.surface, padding: 24,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10,
  },
  categoryTag: {
    alignSelf: 'flex-start',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  catImage: { width: 16, height: 16 },
  categoryTagText: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.textPrimary, lineHeight: 30 },
  price: { fontSize: 28, fontWeight: '900', color: COLORS.primary },
  // === INFO GRID ===
  infoGrid: { padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoCard: {
    width: '47%', backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    padding: 14, gap: 8,
    ...SHADOWS.small,
  },
  infoIconCircle: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  infoLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '700', textTransform: 'uppercase' },
  infoValue: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
  // === DESCRIPTION ===
  descSection: {
    margin: 16, backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    padding: 18, gap: 10,
    ...SHADOWS.small,
  },
  descTitle: { fontSize: 16, fontWeight: '900', color: COLORS.textPrimary },
  descText: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 24 },
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
    backgroundColor: COLORS.textMuted, opacity: 0.7,
    shadowColor: 'transparent', elevation: 0,
  },
  applyBtnText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
});
