import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, Alert, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getAllTasks, applyTask, getMyJobsAsWorker } from '../../api/tasks';

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


  if (isLoading) return <ActivityIndicator color="#0d9488" style={{ flex: 1, marginTop: 100 }} />;
  if (!task) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#9ca3af' }}>Không tìm thấy công việc này.</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chi tiết công việc</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.categoryTag}>
            <Text style={styles.categoryTagText}>Danh mục #{task.category}</Text>
          </View>
          <Text style={styles.title}>{task.title}</Text>
          <Text style={styles.price}>{parseInt(task.price).toLocaleString('vi-VN')}đ</Text>
        </View>

        {/* Thông tin */}
        <View style={styles.infoGrid}>
          <View style={styles.infoCard}>
            <Ionicons name="calendar-outline" size={22} color="#0051d5" />
            <Text style={styles.infoLabel}>Thời gian</Text>
            <Text style={styles.infoValue}>{new Date(task.scheduled_time).toLocaleString('vi-VN')}</Text>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="location-outline" size={22} color="#0d9488" />
            <Text style={styles.infoLabel}>Địa điểm</Text>
            <Text style={styles.infoValue}>{task.location}</Text>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="person-outline" size={22} color="#f59e0b" />
            <Text style={styles.infoLabel}>Phụ huynh</Text>
            <Text style={styles.infoValue}>{task.parent_name}</Text>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="cash-outline" size={22} color="#059669" />
            <Text style={styles.infoLabel}>Thù lao</Text>
            <Text style={[styles.infoValue, { color: '#059669', fontWeight: '800' }]}>
              {parseInt(task.price).toLocaleString('vi-VN')}đ
            </Text>
          </View>
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
            (applying || hasApplied) && { opacity: 0.7, backgroundColor: '#9ca3af', shadowColor: 'transparent', elevation: 0 }
          ]}
          onPress={handleApply} 
          disabled={applying || hasApplied}
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
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  body: { flex: 1 },
  hero: { backgroundColor: '#fff', padding: 24, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 8 },
  categoryTag: { alignSelf: 'flex-start', backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  categoryTagText: { fontSize: 11, fontWeight: '700', color: '#0051d5', textTransform: 'uppercase' },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', lineHeight: 30 },
  price: { fontSize: 28, fontWeight: '900', color: '#0d9488' },
  infoGrid: { padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoCard: { width: '47%', backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 6, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, elevation: 1 },
  infoLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase' },
  infoValue: { fontSize: 13, fontWeight: '700', color: '#111827' },
  descSection: { margin: 16, backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  descTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  descText: { fontSize: 15, color: '#374151', lineHeight: 24 },
  footer: { padding: 20, paddingBottom: 36, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  applyBtn: { backgroundColor: '#0d9488', borderRadius: 16, height: 56, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, shadowColor: '#0d9488', shadowOpacity: 0.4, shadowRadius: 16, elevation: 6 },
  applyBtnText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
});
