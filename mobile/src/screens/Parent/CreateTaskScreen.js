import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { createTask } from '../../api/tasks';

const CATEGORIES = [
  { id: 1, icon: '📚', name: 'Gia sư', hint: '150.000đ - 300.000đ/buổi' },
  { id: 2, icon: '🚗', name: 'Đón trẻ', hint: '80.000đ - 150.000đ/lần' },
  { id: 3, icon: '🧹', name: 'Dọn dẹp', hint: '200.000đ - 400.000đ/ca' },
  { id: 4, icon: '👶', name: 'Trông trẻ', hint: '100.000đ - 200.000đ/buổi' },
  { id: 5, icon: '🛒', name: 'Mua sắm hộ', hint: '50.000đ - 100.000đ/lần' },
];

export default function CreateTaskScreen() {
  const navigation = useNavigation();
  const [selectedCat, setSelectedCat] = useState(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [price, setPrice] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const cat = CATEGORIES.find(c => c.id === selectedCat);

  const handleSubmit = async () => {
    if (!title || !description || !location || !date || !time || !price) {
      Alert.alert('Thiếu thông tin', 'Vui lòng điền đầy đủ tất cả các trường.');
      return;
    }
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!dateRegex.test(date) || !timeRegex.test(time)) {
      Alert.alert('Sai định dạng', 'Ngày phải là YYYY-MM-DD, giờ phải là HH:MM');
      return;
    }

    setIsLoading(true);
    try {
      await createTask({
        category: selectedCat,
        title,
        description,
        location,
        scheduled_time: `${date}T${time}:00+07:00`,
        price: parseInt(price),
      });
      Alert.alert('✅ Thành công!', 'Đã đăng việc lên cộng đồng.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      const data = error.response?.data;
      const msg = typeof data === 'object' ? JSON.stringify(data) : 'Đăng việc thất bại.';
      Alert.alert('Lỗi', msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="close" size={22} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Đăng việc mới</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* Chọn danh mục */}
        <Text style={styles.label}>Chọn loại dịch vụ</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catsScroll}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity key={c.id} style={[styles.catBtn, selectedCat === c.id && styles.catBtnActive]}
              onPress={() => setSelectedCat(c.id)}>
              <Text style={styles.catIcon}>{c.icon}</Text>
              <Text style={[styles.catName, selectedCat === c.id && styles.catNameActive]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Gợi ý giá */}
        <View style={styles.priceHint}>
          <Ionicons name="bulb-outline" size={14} color="#0051d5" />
          <Text style={styles.priceHintText}>Gợi ý mức giá cho {cat?.name}: {cat?.hint}</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="Tiêu đề công việc *" placeholderTextColor="#9ca3af"
            value={title} onChangeText={setTitle} />
          <TextInput style={[styles.input, styles.textarea]} placeholder="Mô tả chi tiết yêu cầu *"
            placeholderTextColor="#9ca3af" value={description} onChangeText={setDescription}
            multiline numberOfLines={4} textAlignVertical="top" />
          <View style={styles.inputRow}>
            <Ionicons name="location-outline" size={18} color="#6b7280" style={styles.inputIcon} />
            <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Địa điểm thực hiện *" placeholderTextColor="#9ca3af"
              value={location} onChangeText={setLocation} />
          </View>
          <View style={styles.twoCol}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Ngày (YYYY-MM-DD) *"
              placeholderTextColor="#9ca3af" value={date} onChangeText={setDate} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Giờ (HH:MM) *"
              placeholderTextColor="#9ca3af" value={time} onChangeText={setTime} />
          </View>
          <View style={styles.inputRow}>
            <TextInput style={[styles.input, { flex: 1, marginBottom: 0, fontSize: 18, fontWeight: '700', color: '#0051d5' }]}
              placeholder="0" placeholderTextColor="#d1d5db" value={price} onChangeText={setPrice}
              keyboardType="numeric" />
            <Text style={styles.currency}>VNĐ/buổi</Text>
          </View>
        </View>
      </ScrollView>

      {/* Submit button */}
      <View style={styles.footer}>
        <TouchableOpacity style={[styles.submitBtn, isLoading && { opacity: 0.7 }]}
          onPress={handleSubmit} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.submitText}>Đăng lên cộng đồng</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  body: { flex: 1, padding: 20 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  catsScroll: { marginBottom: 12 },
  catBtn: { alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fff', marginRight: 10, minWidth: 76 },
  catBtnActive: { borderColor: '#0051d5', backgroundColor: '#eff6ff' },
  catIcon: { fontSize: 24, marginBottom: 4 },
  catName: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  catNameActive: { color: '#0051d5' },
  priceHint: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 10, padding: 10, marginBottom: 20 },
  priceHintText: { flex: 1, fontSize: 12, color: '#0051d5', fontWeight: '500' },
  form: { gap: 12 },
  input: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#111827', marginBottom: 0 },
  textarea: { minHeight: 100, paddingTop: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', paddingHorizontal: 16, height: 54 },
  inputIcon: { marginRight: 8 },
  twoCol: { flexDirection: 'row', gap: 12 },
  currency: { fontSize: 14, fontWeight: '700', color: '#6b7280', marginLeft: 8 },
  footer: { padding: 20, paddingBottom: 36, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  submitBtn: { backgroundColor: '#0051d5', borderRadius: 14, height: 54, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, shadowColor: '#0051d5', shadowOpacity: 0.3, shadowRadius: 12, elevation: 4 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
