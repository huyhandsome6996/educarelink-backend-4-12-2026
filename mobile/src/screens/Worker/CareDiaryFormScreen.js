// ============================================================
// CareDiaryFormScreen — Worker ghi/sửa nhật ký chăm sóc (B1)
// Receives: taskId, taskTitle via navigation params.
// Nếu entry đã tồn tại → load data cũ vào form (PATCH).
// Nếu chưa có → form trống (POST).
// ============================================================

import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Image} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {COLORS, SHADOWS, SIZES, TYPO} from '../../theme/colors';
import { createCareDiaryEntry, updateCareDiaryEntry, getCareDiaryEntry, uploadCareDiaryAttachments } from '../../api/careDiary';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MOODS = [
  { icon: 'happy', label: 'Vui vẻ & Hợp tác' },
  { icon: 'sad', label: 'Buồn & Khóc nhiều' },
  { icon: 'alert-circle', label: 'Cần chú ý' },
  { icon: 'thumbs-up', label: 'Bình thường' },
];

const ACTIVITY_STATUSES = [
  { key: 'done', label: 'Hoàn thành' },
  { key: 'partial', label: 'Một phần' },
  { key: 'skipped', label: 'Bỏ qua' },
];

export default function CareDiaryFormScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { taskId, taskTitle } = route.params || {};
  const insets = useSafeAreaInsets();

  // === FORM STATE ===
  const [moodIcon, setMoodIcon] = useState('happy');
  const [moodLabel, setMoodLabel] = useState('Vui vẻ & Hợp tác');
  const [moodNote, setMoodNote] = useState('');
  const [completionPercent, setCompletionPercent] = useState('85');
  const [note, setNote] = useState('');
  const [activities, setActivities] = useState([
    { time: '', title: '', description: '', status: 'done' },
  ]);
  const [images, setImages] = useState([]); // [{uri, ...pickerResult}]

  // === UI STATE ===
  const [loading, setLoading] = useState(false);
  const [loadingEntry, setLoadingEntry] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isExisting, setIsExisting] = useState(false);

  // === LOAD EXISTING ENTRY ===
  useEffect(() => {
    if (!taskId) { setLoadingEntry(false); return; }
    let mounted = true;
    setLoadingEntry(true);
    getCareDiaryEntry(taskId)
      .then(res => {
        if (!mounted) return;
        const d = res.data;
        setIsExisting(true);
        setMoodIcon(d.mood?.icon || 'happy');
        setMoodLabel(d.mood?.label || '');
        setMoodNote(d.mood?.note || '');
        setCompletionPercent(String(d.completion?.percent || 0));
        setNote(d.note || '');
        if (d.activities?.length) {
          setActivities(d.activities.map(a => ({
            time: a.time, title: a.title, description: a.desc || '', status: a.status,
          })));
        }
      })
      .catch(() => { /* 404 = chưa có entry → form trống */ })
      .finally(() => { if (mounted) setLoadingEntry(false); });
    return () => { mounted = false; };
  }, [taskId]);

  // === ACTIVITY CRUD ===
  const updateActivity = (idx, field, value) => {
    setActivities(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };
  const addActivity = () => setActivities(prev => [...prev, { time: '', title: '', description: '', status: 'done' }]);
  const removeActivity = (idx) => setActivities(prev => prev.filter((_, i) => i !== idx));

  // === IMAGE PICKER ===
  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets) {
      setImages(prev => [...prev, ...result.assets]);
    }
  };

  // === SUBMIT ===
  const handleSubmit = async () => {
    if (submitting) return;
    // Validate cơ bản
    const validActivities = activities.filter(a => a.title.trim());
    if (!moodLabel && !note && !validActivities.length) {
      Alert.alert('Thông tin thiếu', 'Vui lòng nhập ít nhất tâm trạng, ghi chú hoặc hoạt động.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        mood_icon: moodIcon,
        mood_label: moodLabel,
        mood_note: moodNote,
        completion_percent: parseInt(completionPercent) || 0,
        note,
        activities: validActivities.map((a, i) => ({
          time: a.time, title: a.title, description: a.description, status: a.status, order: i,
        })),
      };

      if (isExisting) {
        await updateCareDiaryEntry(taskId, payload);
      } else {
        await createCareDiaryEntry(taskId, payload);
      }

      // Upload ảnh nếu có
      if (images.length > 0) {
        const formData = new FormData();
        images.forEach(img => {
          formData.append('images', {
            uri: img.uri,
            type: img.mimeType || 'image/jpeg',
            name: img.fileName || `diary_${Date.now()}.jpg`,
          });
        });
        try { await uploadCareDiaryAttachments(taskId, formData); } catch (e) {
          console.warn('Upload ảnh thất bại (nhưng nhật ký đã lưu):', e);
        }
      }

      Alert.alert(isExisting ? 'Đã cập nhật' : 'Đã lưu nhật ký', 'Nhật ký chăm sóc đã được lưu thành công.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      const msg = err.response?.data?.error || 'Không thể lưu nhật ký. Vui lòng thử lại.';
      Alert.alert('Lỗi', msg);
    } finally {
      setSubmitting(false);
    }
  };

  // === LOADING EXISTING ===
  if (loadingEntry) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceContainerLow} />
      <View style={[styles.appBar, { paddingTop: insets.top + 32 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.appBarBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button" accessibilityLabel="Quay lại">
          <Ionicons name="arrow-back" size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>{isExisting ? 'Sửa nhật ký' : 'Ghi nhật ký'}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Task info */}
        {taskTitle ? (
          <View style={styles.taskInfo}>
            <Ionicons name="briefcase-outline" size={16} color={COLORS.primary} />
            <Text style={styles.taskInfoText} numberOfLines={1}>{taskTitle}</Text>
          </View>
        ) : null}

        {/* Mood */}
        <Text style={styles.sectionTitle}>Tâm trạng của bé</Text>
        <View style={styles.moodRow}>
          {MOODS.map(m => (
            <TouchableOpacity key={m.icon} style={[styles.moodChip, moodIcon === m.icon && styles.moodChipActive]}
              onPress={() => { setMoodIcon(m.icon); setMoodLabel(m.label); }} activeOpacity={0.7}>
              <Ionicons name={m.icon} size={20} color={moodIcon === m.icon ? COLORS.textOnPrimary : COLORS.onSurfaceVariant} />
            </TouchableOpacity>
          ))}
        </View>
        <TextInput style={styles.input} value={moodNote} onChangeText={setMoodNote}
          placeholder="Ghi chú về tâm trạng (tuỳ chọn)" placeholderTextColor={COLORS.textMuted} />

        {/* Completion % */}
        <Text style={styles.sectionTitle}>Mức độ hoàn thành</Text>
        <View style={styles.sliderRow}>
          <TextInput style={styles.percentInput} value={completionPercent}
            onChangeText={setCompletionPercent} keyboardType="numeric" maxLength={3} />
          <Text style={styles.percentSymbol}>%</Text>
        </View>

        {/* Activities */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Hoạt động</Text>
          <TouchableOpacity onPress={addActivity} style={styles.addBtn} activeOpacity={0.7}>
            <Ionicons name="add" size={18} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
        {activities.map((act, idx) => (
          <View key={idx} style={styles.activityCard}>
            <View style={styles.activityRowTop}>
              <TextInput style={styles.timeInput} value={act.time} onChangeText={v => updateActivity(idx, 'time', v)}
                placeholder="HH:MM" placeholderTextColor={COLORS.textMuted} maxLength={5} />
              <View style={styles.statusChips}>
                {ACTIVITY_STATUSES.map(s => (
                  <TouchableOpacity key={s.key} style={[styles.statusChip, act.status === s.key && styles.statusChipActive]}
                    onPress={() => updateActivity(idx, 'status', s.key)} activeOpacity={0.7}>
                    <Text style={[styles.statusChipText, act.status === s.key && styles.statusChipTextActive]}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {activities.length > 1 && (
                <TouchableOpacity onPress={() => removeActivity(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={20} color={COLORS.error} />
                </TouchableOpacity>
              )}
            </View>
            <TextInput style={styles.actTitle} value={act.title} onChangeText={v => updateActivity(idx, 'title', v)}
              placeholder="Tên hoạt động" placeholderTextColor={COLORS.textMuted} />
            <TextInput style={styles.actDesc} value={act.description} onChangeText={v => updateActivity(idx, 'description', v)}
              placeholder="Mô tả (tuỳ chọn)" placeholderTextColor={COLORS.textMuted} multiline numberOfLines={2} />
          </View>
        ))}

        {/* Note */}
        <Text style={styles.sectionTitle}>Ghi chú tổng kết</Text>
        <TextInput style={[styles.input, styles.noteInput]} value={note} onChangeText={setNote}
          placeholder="Ghi chú cuối ca..." placeholderTextColor={COLORS.textMuted}
          multiline numberOfLines={4} textAlignVertical="top" />

        {/* Photos */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Ảnh đính kèm</Text>
          <TouchableOpacity onPress={pickImages} style={styles.addBtn} activeOpacity={0.7}>
            <Ionicons name="image-outline" size={18} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
        {images.length > 0 && (
          <View style={styles.imageRow}>
            {images.map((img, idx) => (
              <View key={idx} style={styles.imageThumb}>
                <Image source={{ uri: img.uri }} style={styles.imageThumbImg} />
                <TouchableOpacity style={styles.imageRemove} onPress={() => setImages(prev => prev.filter((_, i) => i !== idx))}>
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Submit button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}>
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>{isExisting ? 'Cập nhật nhật ký' : 'Lưu nhật ký'}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.surfaceContainerLow },
  appBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12, backgroundColor: COLORS.surfaceContainerLow,
  },
  appBarBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  appBarTitle: { ...TYPO.h2, color: COLORS.primary, flex: 1, textAlign: 'center', marginRight: 44 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 16 },
  // Task info
  taskInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surfaceContainer, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: COLORS.outlineVariant },
  taskInfoText: { ...TYPO.bodySmall, color: COLORS.onSurface, flex: 1 },
  // Section
  sectionTitle: { ...TYPO.h4, color: COLORS.onSurface, marginBottom: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.primarySoft },
  // Mood
  moodRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  moodChip: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.surfaceContainer,
    justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.outlineVariant,
  },
  moodChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  // Input
  input: {
    backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.outlineVariant,
    paddingHorizontal: 14, paddingVertical: 12, ...TYPO.body, color: COLORS.onSurface, marginBottom: 8,
  },
  // Completion
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  percentInput: { width: 60, backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.outlineVariant, paddingHorizontal: 12, paddingVertical: 10, ...TYPO.h4, color: COLORS.onSurface, textAlign: 'center' },
  percentSymbol: { ...TYPO.h3, color: COLORS.onSurfaceVariant },
  // Activity
  activityCard: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: COLORS.outlineVariant, marginBottom: 12, gap: 8,
  },
  activityRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: {
    width: 64, backgroundColor: COLORS.surfaceContainerLow, borderRadius: 8, borderWidth: 1, borderColor: COLORS.outlineVariant,
    paddingHorizontal: 8, paddingVertical: 8, ...TYPO.caption, color: COLORS.onSurface, textAlign: 'center',
  },
  statusChips: { flex: 1, flexDirection: 'row', gap: 4 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: COLORS.surfaceContainerLow, borderWidth: 1, borderColor: COLORS.outlineVariant },
  statusChipActive: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  statusChipText: { fontSize: 10, fontWeight: '600', color: COLORS.onSurfaceVariant },
  statusChipTextActive: { color: COLORS.primary },
  actTitle: { backgroundColor: COLORS.surfaceContainerLow, borderRadius: 8, borderWidth: 1, borderColor: COLORS.outlineVariant, paddingHorizontal: 10, paddingVertical: 8, ...TYPO.bodySmall, color: COLORS.onSurface },
  actDesc: { backgroundColor: COLORS.surfaceContainerLow, borderRadius: 8, borderWidth: 1, borderColor: COLORS.outlineVariant, paddingHorizontal: 10, paddingVertical: 8, ...TYPO.bodySmall, color: COLORS.onSurface, minHeight: 40, textAlignVertical: 'top' },
  noteInput: { minHeight: 80, textAlignVertical: 'top' },
  // Images
  imageRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  imageThumb: { width: 80, height: 80, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  imageThumbImg: { width: '100%', height: '100%' },
  imageRemove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  // Footer
  footer: { padding: 16, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.outlineVariant },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14, height: 50, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, ...SHADOWS.large,
  },
  submitBtnText: { ...TYPO.button, color: COLORS.textOnPrimary, fontWeight: '700' },
});
