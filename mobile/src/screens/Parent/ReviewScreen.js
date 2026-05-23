import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert, ActivityIndicator, TextInput } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { createReview } from '../../api/tasks';

export default function ReviewScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { taskId, revieweeId } = route.params || {};
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!comment.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng để lại nhận xét của bạn.');
      return;
    }
    if (!revieweeId) {
      Alert.alert('Lỗi', 'Không tìm thấy thông tin người được đánh giá.');
      return;
    }
    setIsLoading(true);
    try {
      await createReview({ task: taskId, reviewee: revieweeId, rating, comment });
      Alert.alert('✅ Cảm ơn!', 'Đánh giá của bạn đã được ghi nhận.', [
        { text: 'OK', onPress: () => navigation.popToTop() }
      ]);
    } catch (e) {
      Alert.alert('Lỗi', e.response?.data?.detail || 'Gửi đánh giá thất bại.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="close" size={22} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Đánh giá Carepartner</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.heroBox}>
          <Text style={styles.heroEmoji}>⭐</Text>
          <Text style={styles.heroTitle}>Công việc hoàn thành!</Text>
          <Text style={styles.heroSub}>Hãy đánh giá trải nghiệm của bạn</Text>
        </View>

        {/* Rating stars */}
        <Text style={styles.label}>Đánh giá sao</Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map(star => (
            <TouchableOpacity key={star} onPress={() => setRating(star)}>
              <Ionicons name={star <= rating ? 'star' : 'star-outline'} size={40} color={star <= rating ? '#f59e0b' : '#d1d5db'} />
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.ratingLabel}>{['', 'Rất tệ', 'Tệ', 'Ổn', 'Tốt', 'Xuất sắc'][rating]}</Text>

        {/* Comment */}
        <Text style={styles.label}>Nhận xét của bạn</Text>
        <TextInput
          style={styles.textarea}
          placeholder="Chia sẻ trải nghiệm thực tế của bạn về Carepartner này..."
          placeholderTextColor="#9ca3af"
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />

        <TouchableOpacity style={[styles.submitBtn, isLoading && { opacity: 0.7 }]}
          onPress={handleSubmit} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.submitText}>Gửi đánh giá</Text>
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
  body: { flex: 1, padding: 24, gap: 16 },
  heroBox: { backgroundColor: '#fffbeb', borderRadius: 20, padding: 24, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#fde68a' },
  heroEmoji: { fontSize: 48 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#92400e' },
  heroSub: { fontSize: 14, color: '#b45309' },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  ratingLabel: { textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#f59e0b' },
  textarea: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: '#e5e7eb', padding: 16, fontSize: 15, color: '#111827', minHeight: 120 },
  submitBtn: { backgroundColor: '#0051d5', borderRadius: 14, height: 54, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, shadowColor: '#0051d5', shadowOpacity: 0.3, shadowRadius: 12, elevation: 4, marginTop: 8 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
