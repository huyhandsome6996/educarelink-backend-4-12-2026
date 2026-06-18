import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar,
  Alert, ActivityIndicator, Platform, ScrollView, Image,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { createComplaint } from '../../api/moderation';
import { COLORS, SHADOWS, SIZES, TYPO, FRAGMENTS } from '../../theme/colors';

const COMPLAINT_TYPES = [
  { value: 'exploitation', label: 'Bóc lột sức lao động', icon: 'alert-circle' },
  { value: 'abuse', label: 'Ngược đãi (thể chất/tinh thần)', icon: 'heart-dislike' },
  { value: 'harassment', label: 'Quấy rối / xúc phạm', icon: 'warning' },
  { value: 'non_payment', label: 'Không trả / trả thiếu tiền', icon: 'cash-off' },
  { value: 'fraud', label: 'Gian lận / lừa đảo', icon: 'bug' },
  { value: 'unsafe', label: 'Môi trường không an toàn', icon: 'shield-off' },
  { value: 'other', label: 'Khác', icon: 'dots-horizontal' },
];

export default function ComplaintScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { reportedUserId, taskTitle, taskId } = route.params || {};

  const [complaintType, setComplaintType] = useState('non_payment');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [evidence, setEvidence] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Cần quyền', 'Vui lòng cấp quyền truy cập ảnh.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true, quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      setEvidence([...evidence, result.assets[0]]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Cần quyền', 'Vui lòng cấp quyền camera.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true, quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      setEvidence([...evidence, result.assets[0]]);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tiêu đề và mô tả.');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('reported_user_id', reportedUserId);
      if (taskId) formData.append('task_id', taskId);
      formData.append('complaint_type', complaintType);
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      evidence.forEach((ev, idx) => {
        formData.append(`evidence_${idx}`, {
          uri: ev.uri,
          type: ev.mimeType || 'image/jpeg',
          name: `evidence_${idx}.jpg`,
        });
      });
      await createComplaint(formData);
      Alert.alert('✅ Đã gửi', 'Khiếu nại của bạn đã được gửi. Admin sẽ xử lý sớm.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      const msg = e.response?.data?.error || 'Gửi khiếu nại thất bại.';
      Alert.alert('Lỗi', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="close" size={22} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gửi khiếu nại</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={18} color={COLORS.primary} />
          <Text style={styles.infoText}>
            Mô tả chi tiết sự việc. Đính kèm ảnh bằng chứng nếu có. Admin sẽ xem xét và xử lý.
            AI sẽ hỗ trợ phân tích khiếu nại của bạn 24/7.
          </Text>
        </View>

        <Text style={styles.label}>Loại khiếu nại *</Text>
        <View style={styles.typeGrid}>
          {COMPLAINT_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.typeBtn, complaintType === t.value && styles.typeBtnActive]}
              onPress={() => setComplaintType(t.value)}
              activeOpacity={0.8}
            >
              <Ionicons name={t.icon} size={16} color={complaintType === t.value ? '#fff' : COLORS.primary} />
              <Text style={[styles.typeBtnText, complaintType === t.value && styles.typeBtnTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Tiêu đề *</Text>
        <TextInput style={styles.input} placeholder="VD: Phụ huynh không trả tiền sau khi xong việc"
          placeholderTextColor={COLORS.textMuted} value={title} onChangeText={setTitle} />

        <Text style={styles.label}>Mô tả chi tiết *</Text>
        <TextInput style={[styles.input, styles.textarea]} placeholder="Mô tả sự việc, thời gian, địa điểm..."
          placeholderTextColor={COLORS.textMuted} value={description} onChangeText={setDescription}
          multiline numberOfLines={5} textAlignVertical="top" />

        <Text style={styles.label}>Bằng chứng (tuỳ chọn)</Text>
        <View style={styles.evidenceRow}>
          <TouchableOpacity style={styles.evidenceBtn} onPress={pickImage}>
            <Ionicons name="images-outline" size={20} color={COLORS.primary} />
            <Text style={styles.evidenceBtnText}>Thư viện</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.evidenceBtn} onPress={takePhoto}>
            <Ionicons name="camera-outline" size={20} color={COLORS.primary} />
            <Text style={styles.evidenceBtnText}>Chụp ảnh</Text>
          </TouchableOpacity>
        </View>

        {evidence.length > 0 && (
          <View style={styles.evidenceList}>
            {evidence.map((ev, idx) => (
              <View key={idx} style={styles.evidenceItem}>
                <Image source={{ uri: ev.uri }} style={styles.evidencePreview} />
                <TouchableOpacity style={styles.evidenceRemove} onPress={() => setEvidence(evidence.filter((_, i) => i !== idx))}>
                  <Ionicons name="close-circle" size={20} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
          onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}>
          {submitting ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.submitText}>Gửi khiếu nại</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SIZES.md, paddingTop: 56, paddingBottom: 16, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { width: 40, height: 40, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { ...TYPO.h4, color: COLORS.textPrimary, fontWeight: '800' },
  body: { flex: 1, padding: SIZES.md },
  infoBox: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusMd, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: COLORS.primarySoft },
  infoText: { flex: 1, ...TYPO.bodySmall, color: COLORS.primaryDark, lineHeight: 18 },
  label: { ...TYPO.overline, color: COLORS.textMuted, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: COLORS.surface, borderRadius: SIZES.radiusSm, borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 12, ...TYPO.body, color: COLORS.textPrimary },
  textarea: { minHeight: 100, paddingTop: 14 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.surface, borderRadius: SIZES.radiusSm, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1.5, borderColor: COLORS.border },
  typeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  typeBtnText: { ...TYPO.caption, color: COLORS.textSecondary },
  typeBtnTextActive: { color: '#fff', fontWeight: '700' },
  evidenceRow: { flexDirection: 'row', gap: 10 },
  evidenceBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusSm, paddingVertical: 12, borderWidth: 1.5, borderColor: COLORS.primarySoft, borderStyle: 'dashed' },
  evidenceBtnText: { ...TYPO.buttonSmall, color: COLORS.primary },
  evidenceList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  evidenceItem: { position: 'relative' },
  evidencePreview: { width: 80, height: 80, borderRadius: SIZES.radiusSm },
  evidenceRemove: { position: 'absolute', top: -6, right: -6 },
  footer: { padding: 20, paddingBottom: 36, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd, height: 54, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  submitText: { color: '#fff', ...TYPO.button },
});
