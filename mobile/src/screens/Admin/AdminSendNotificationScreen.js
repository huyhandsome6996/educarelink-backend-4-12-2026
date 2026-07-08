import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, Alert, TextInput, ScrollView, Modal, FlatList, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { sendNotification, getAllWorkers } from '../../api/admin';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

// ====================================================================
// Admin Send Notification — đồng bộ với web (admin_dashboard.html phần notify)
// 2 mode: gửi broadcast cho tất cả carepartner HOẶC gửi cho 1 worker cụ thể
// ====================================================================

export default function AdminSendNotificationScreen() {
  const navigation = useNavigation();
  const [mode, setMode] = useState('broadcast'); // broadcast | individual
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showWorkerPicker, setShowWorkerPicker] = useState(false);

  useEffect(() => {
    getAllWorkers().then(res => setWorkers(res.data || [])).catch(() => {});
  }, []);

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập tiêu đề và nội dung.');
      return;
    }
    if (mode === 'individual' && !selectedWorker) {
      Alert.alert('Lỗi', 'Vui lòng chọn carepartner nhận thông báo.');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        title: title.trim(),
        message: message.trim(),
      };
      if (mode === 'broadcast') {
        payload.send_to_all = true;
      } else {
        payload.recipient_id = selectedWorker.id;
      }
      await sendNotification(payload);
      Alert.alert('✅ Thành công', 'Đã gửi thông báo.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) {
      Alert.alert('Lỗi', e.response?.data?.error || 'Gửi thất bại.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gửi thông báo</Text>
        <Ionicons name="notifications" size={22} color="#fff" style={{ marginRight: 8 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: SIZES.md, gap: 16, paddingBottom: 40 }}>
        {/* Mode switch */}
        <View>
          <Text style={styles.sectionLabel}>Loại thông báo</Text>
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeCard, mode === 'broadcast' && styles.modeCardActive]}
              onPress={() => setMode('broadcast')}
              activeOpacity={0.85}
            >
              <Ionicons name="megaphone" size={22} color={mode === 'broadcast' ? '#fff' : COLORS.primary} />
              <Text style={[styles.modeLabel, mode === 'broadcast' && styles.modeLabelActive]}>Gửi cho tất cả Carepartner</Text>
              <Text style={[styles.modeDesc, mode === 'broadcast' && styles.modeDescActive]}>
                Thông báo chung, mọi carepartner đều nhận được
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeCard, mode === 'individual' && styles.modeCardActive]}
              onPress={() => setMode('individual')}
              activeOpacity={0.85}
            >
              <Ionicons name="person" size={22} color={mode === 'individual' ? '#fff' : COLORS.primary} />
              <Text style={[styles.modeLabel, mode === 'individual' && styles.modeLabelActive]}>Gửi cho 1 Carepartner</Text>
              <Text style={[styles.modeDesc, mode === 'individual' && styles.modeDescActive]}>
                Chọn carepartner cụ thể từ danh sách
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recipient picker (individual mode) */}
        {mode === 'individual' && (
          <View>
            <Text style={styles.sectionLabel}>Người nhận</Text>
            <TouchableOpacity
              style={styles.recipientPicker}
              onPress={() => setShowWorkerPicker(true)}
              activeOpacity={0.85}
            >
              {selectedWorker ? (
                <View style={styles.recipientInfo}>
                  <View style={styles.recipientAvatar}>
                    <Text style={styles.recipientAvatarText}>{selectedWorker.username?.[0]?.toUpperCase()}</Text>
                  </View>
                  <View>
                    <Text style={styles.recipientName}>
                      {selectedWorker.first_name || selectedWorker.last_name
                        ? `${selectedWorker.first_name} ${selectedWorker.last_name || ''}`.trim()
                        : selectedWorker.username}
                    </Text>
                    <Text style={styles.recipientUsername}>@{selectedWorker.username}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.recipientPlaceholder}>
                  <Ionicons name="person-add" size={20} color={COLORS.textMuted} />
                  <Text style={styles.recipientPlaceholderText}>Chọn carepartner...</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Title */}
        <View>
          <Text style={styles.sectionLabel}>Tiêu đề <Text style={{ color: COLORS.error }}>*</Text></Text>
          <TextInput
            style={styles.textInput}
            value={title}
            onChangeText={setTitle}
            placeholder="VD: Bảo trì hệ thống, Thông báo mới, ..."
            placeholderTextColor={COLORS.textMuted}
            maxLength={255}
          />
        </View>

        {/* Message */}
        <View>
          <Text style={styles.sectionLabel}>Nội dung <Text style={{ color: COLORS.error }}>*</Text></Text>
          <TextInput
            style={[styles.textInput, styles.messageInput]}
            value={message}
            onChangeText={setMessage}
            placeholder="Nhập nội dung thông báo..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            textAlignVertical="top"
            maxLength={2000}
          />
          <Text style={styles.charCount}>{message.length}/2000</Text>
        </View>

        {/* Preview */}
        {(title || message) && (
          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>👁️ Preview</Text>
            <Text style={styles.previewTitle}>{title || '(Tiêu đề)'}</Text>
            <Text style={styles.previewMessage}>{message || '(Nội dung)'}</Text>
            <Text style={styles.previewRecipient}>
              {mode === 'broadcast' ? '📢 Tất cả carepartner' : `👤 ${selectedWorker?.username || '(chưa chọn)'}`}
            </Text>
          </View>
        )}

        {/* Send button */}
        <TouchableOpacity
          style={[styles.sendBtn, isLoading && { opacity: 0.6 }]}
          onPress={handleSend}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.sendBtnText}>Gửi thông báo</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Worker picker modal */}
      <Modal visible={showWorkerPicker} animationType="slide" transparent={false} onRequestClose={() => setShowWorkerPicker(false)}>
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Chọn carepartner</Text>
            <TouchableOpacity onPress={() => setShowWorkerPicker(false)} style={styles.pickerCloseBtn}>
              <Ionicons name="close" size={22} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={workers.filter(w => w.is_approved)}
            keyExtractor={i => i.id.toString()}
            renderItem={({ item }) => {
              const isSelected = selectedWorker?.id === item.id;
              return (
                <TouchableOpacity
                  style={[styles.workerItem, isSelected && styles.workerItemSelected]}
                  onPress={() => {
                    setSelectedWorker(item);
                    setShowWorkerPicker(false);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.workerAvatar}>
                    <Text style={styles.workerAvatarText}>{item.username?.[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.workerName}>
                      {item.first_name || item.last_name
                        ? `${item.first_name} ${item.last_name || ''}`.trim()
                        : item.username}
                    </Text>
                    <Text style={styles.workerUsername}>@{item.username} • {item.email || '—'}</Text>
                  </View>
                  {isSelected && <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={40} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>Không có carepartner nào</Text>
              </View>
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16,
    backgroundColor: COLORS.primary, gap: 10,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: SIZES.radiusSm,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { ...TYPO.h4, color: '#fff', fontWeight: '800', flex: 1 },
  sectionLabel: { ...TYPO.buttonSmall, color: COLORS.textSecondary, marginBottom: 8, fontWeight: '700' },
  modeRow: { gap: 10 },
  modeCard: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: 16,
    borderWidth: 2, borderColor: COLORS.border, gap: 6, ...SHADOWS.small,
  },
  modeCardActive: {
    borderColor: COLORS.primary, backgroundColor: COLORS.primary, ...SHADOWS.large,
  },
  modeLabel: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  modeLabelActive: { color: '#fff' },
  modeDesc: { ...TYPO.caption, color: COLORS.textSecondary },
  modeDescActive: { color: 'rgba(255,255,255,0.9)' },
  recipientPicker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: 14,
    borderWidth: 1.5, borderColor: COLORS.border, ...SHADOWS.small,
  },
  recipientInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  recipientAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  recipientAvatarText: { color: '#fff', ...TYPO.h5, fontWeight: '800' },
  recipientName: { ...TYPO.body, color: COLORS.textPrimary, fontWeight: '700' },
  recipientUsername: { ...TYPO.caption, color: COLORS.textMuted },
  recipientPlaceholder: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  recipientPlaceholderText: { ...TYPO.body, color: COLORS.textMuted },
  textInput: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: 14,
    borderWidth: 1.5, borderColor: COLORS.border, ...TYPO.body, color: COLORS.textPrimary,
    ...SHADOWS.small,
  },
  messageInput: { minHeight: 120, textAlignVertical: 'top' },
  charCount: { ...TYPO.caption, color: COLORS.textMuted, textAlign: 'right', marginTop: 4 },
  previewCard: {
    backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusMd, padding: 14, gap: 6,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary, ...SHADOWS.small,
  },
  previewLabel: { ...TYPO.overline, color: COLORS.primary, fontWeight: '700' },
  previewTitle: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  previewMessage: { ...TYPO.body, color: COLORS.textPrimary },
  previewRecipient: { ...TYPO.caption, color: COLORS.textSecondary, fontStyle: 'italic', marginTop: 4 },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd, paddingVertical: 16,
    ...SHADOWS.large, marginTop: 8,
  },
  sendBtnText: { color: '#fff', ...TYPO.button, fontSize: 16 },
  // Picker modal
  pickerContainer: { flex: 1, backgroundColor: COLORS.background, paddingTop: 56 },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  pickerTitle: { ...TYPO.h4, color: COLORS.textPrimary, fontWeight: '800' },
  pickerCloseBtn: { padding: 4 },
  workerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  workerItemSelected: { backgroundColor: COLORS.primaryLight },
  workerAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  workerAvatarText: { color: '#fff', ...TYPO.h5, fontWeight: '800' },
  workerName: { ...TYPO.body, color: COLORS.textPrimary, fontWeight: '700' },
  workerUsername: { ...TYPO.caption, color: COLORS.textMuted },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { ...TYPO.body, color: COLORS.textMuted },
});
