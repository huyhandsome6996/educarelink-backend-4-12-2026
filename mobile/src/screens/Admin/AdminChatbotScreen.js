import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  StatusBar, ActivityIndicator, KeyboardAvoidingView, Platform, Animated, Alert
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { sendAdminChatMessage } from '../../api/admin';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

// ====================================================================
// Admin AI Chatbot — đồng bộ với web (admin_dashboard.html phần chat)
// Hỗ trợ vision: upload ảnh + message → Gemini phân tích
// ====================================================================

const INITIAL_MESSAGES = [
  {
    id: 'welcome',
    role: 'assistant',
    text: '🛡️ Xin chào Admin! Tôi là trợ lý AI của EduCareLink.\n\nTôi có thể:\n• Thống kê nhanh số liệu hệ thống\n• Phân tích ảnh (CCCD, bằng cấp, ảnh khiếu nại)\n• Gợi ý hành động xử lý khiếu nại\n• Tìm kiếm user theo tiêu chí\n\nBạn có thể gửi kèm ảnh để tôi phân tích! 📸',
  },
];

const showAlert = (title, message) => {
  if (Platform.OS === 'web') {
    alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export default function AdminChatbotScreen() {
  const navigation = useNavigation();
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [attachedImage, setAttachedImage] = useState(null);
  const flatListRef = useRef(null);
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;

  const chatHistoryRef = useRef([]);

  useEffect(() => {
    if (isTyping) {
      const createAnim = (anim, delay) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
          ])
        );
      const a1 = createAnim(dot1Anim, 0);
      const a2 = createAnim(dot2Anim, 150);
      const a3 = createAnim(dot3Anim, 300);
      a1.start(); a2.start(); a3.start();
      return () => { a1.stop(); a2.stop(); a3.stop(); };
    }
  }, [isTyping]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Cần quyền', 'Vui lòng cấp quyền truy cập thư viện ảnh.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      setAttachedImage(result.assets[0]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Cần quyền', 'Vui lòng cấp quyền sử dụng camera.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      setAttachedImage(result.assets[0]);
    }
  };

  const showImagePicker = () => {
    Alert.alert(
      'Đính kèm ảnh',
      'Chọn nguồn ảnh để AI phân tích',
      [
        { text: 'Thư viện', onPress: pickImage },
        { text: 'Camera', onPress: takePhoto },
        { text: 'Huỷ', style: 'cancel' },
      ]
    );
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text && !attachedImage) return;

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      text: text || '(ảnh đính kèm)',
      image: attachedImage?.uri || null,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const imageData = attachedImage;
    setAttachedImage(null);

    // Lưu vào history (chỉ text để backend Gemini không cần ảnh trong history)
    if (text) chatHistoryRef.current.push({ role: 'user', text });

    try {
      // Build FormData — gửi kèm ảnh nếu có
      const formData = new FormData();
      formData.append('message', text || 'Hãy phân tích ảnh này.');
      if (imageData) {
        formData.append('image', {
          uri: imageData.uri,
          type: imageData.mimeType || 'image/jpeg',
          name: 'admin_upload.jpg',
        });
      }

      const res = await sendAdminChatMessage(formData);
      const botText = res.data?.response || res.data?.message || 'AI đang xử lý. Vui lòng thử lại sau!';
      const botMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: botText,
      };

      // Nếu backend trả về thêm actions (gợi ý hành động)
      if (res.data?.actions && Array.isArray(res.data.actions) && res.data.actions.length > 0) {
        botMsg.actions = res.data.actions;
      }

      chatHistoryRef.current.push({ role: 'assistant', text: botText });
      if (chatHistoryRef.current.length > 20) {
        chatHistoryRef.current = chatHistoryRef.current.slice(-20);
      }

      setMessages(prev => [...prev, botMsg]);
    } catch (e) {
      const errMsg = e.response?.data?.error || e.message || 'Lỗi kết nối tới AI.';
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: `❌ ${errMsg}`,
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  useEffect(() => {
    if (flatListRef.current) {
      const timerId = setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      return () => clearTimeout(timerId);
    }
  }, [messages, isTyping]);

  const renderMessage = ({ item }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowBot]}>
        {!isUser && (
          <View style={styles.botAvatar}>
            <Ionicons name="shield-checkmark" size={20} color={COLORS.primary} />
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
          {item.image && (
            <Image source={{ uri: item.image }} style={styles.msgImage} resizeMode="cover" />
          )}
          <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextBot]}>
            {item.text}
          </Text>
          {item.actions && item.actions.length > 0 && (
            <View style={styles.actionsWrap}>
              {item.actions.map((action, idx) => (
                <View key={idx} style={styles.actionChip}>
                  <Ionicons name="sparkles" size={11} color={COLORS.primary} />
                  <Text style={styles.actionText}>{action}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={88}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>AI Trợ lý Admin</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.headerStatus}>Vision + Chat</Text>
          </View>
        </View>
        <Ionicons name="sparkles" size={22} color="#fff" style={{ marginRight: 8 }} />
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={i => i.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListFooterComponent={isTyping ? (
          <View style={styles.typingRow}>
            <View style={styles.botAvatar}>
              <Ionicons name="shield-checkmark" size={20} color={COLORS.primary} />
            </View>
            <View style={styles.typingBubble}>
              <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }]} />
              <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot2Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }]} />
              <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot3Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }]} />
              <Text style={styles.typingText}>AI đang phân tích...</Text>
            </View>
          </View>
        ) : null}
      />

      {/* Preview ảnh đã chọn */}
      {attachedImage && (
        <View style={styles.imagePreviewBar}>
          <Image source={{ uri: attachedImage.uri }} style={styles.previewThumb} />
          <View style={{ flex: 1 }}>
            <Text style={styles.previewLabel}>📸 Ảnh đã đính kèm</Text>
            <Text style={styles.previewHint}>Sẽ gửi kèm tin nhắn tới AI</Text>
          </View>
          <TouchableOpacity onPress={() => setAttachedImage(null)} style={styles.removeImageBtn}>
            <Ionicons name="close-circle" size={22} color={COLORS.error} />
          </TouchableOpacity>
        </View>
      )}

      {/* Quick actions */}
      <View style={styles.quickActionsRow}>
        <TouchableOpacity style={styles.quickBtn} onPress={() => setInput('Thống kê nhanh hệ thống')}>
          <Ionicons name="stats-chart" size={14} color={COLORS.primary} />
          <Text style={styles.quickBtnText}>Thống kê</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={() => setInput('Có bao nhiêu khiếu nại đang chờ xử lý?')}>
          <Ionicons name="alert-circle" size={14} color={COLORS.warning} />
          <Text style={styles.quickBtnText}>Khiếu nại</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={() => setInput('Liệt kê carepartner có đánh giá 1 sao')}>
          <Ionicons name="star-outline" size={14} color={COLORS.error} />
          <Text style={styles.quickBtnText}>Review xấu</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={showImagePicker}>
          <Ionicons name="camera" size={14} color={COLORS.secondary} />
          <Text style={styles.quickBtnText}>Phân tích ảnh</Text>
        </TouchableOpacity>
      </View>

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TouchableOpacity style={styles.attachBtn} onPress={showImagePicker}>
          <Ionicons name="add-circle" size={26} color={COLORS.primary} />
        </TouchableOpacity>
        <View style={[styles.inputWrap, inputFocused && styles.inputWrapFocused]}>
          <TextInput
            style={styles.input}
            placeholder="Nhắn tin cho AI hoặc gửi ảnh để phân tích..."
            placeholderTextColor={COLORS.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={1000}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          />
        </View>
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() && !attachedImage) && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={(!input.trim() && !attachedImage) || isTyping}
        >
          {isTyping ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color={(input.trim() || attachedImage) ? '#fff' : COLORS.textMuted} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.primary, paddingHorizontal: 16,
    paddingTop: 56, paddingBottom: 16, gap: 10,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: SIZES.radiusSm,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  headerInfo: { flex: 1 },
  headerTitle: { ...TYPO.h4, color: '#fff', fontWeight: '800' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: {
    width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff',
  },
  headerStatus: { ...TYPO.caption, color: '#fff', fontWeight: '600' },
  list: { padding: SIZES.md, gap: 12, flexGrow: 1, paddingBottom: 20 },
  msgRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowBot: { justifyContent: 'flex-start' },
  botAvatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  bubble: { maxWidth: '78%', borderRadius: 18, padding: 12 },
  bubbleUser: {
    backgroundColor: COLORS.primary, borderBottomRightRadius: 4, ...SHADOWS.small,
  },
  bubbleBot: {
    backgroundColor: COLORS.surface, borderBottomLeftRadius: 4, ...SHADOWS.cardHover,
    borderWidth: 1, borderColor: COLORS.border,
  },
  bubbleText: { ...TYPO.body },
  bubbleTextUser: { color: COLORS.textOnPrimary },
  bubbleTextBot: { color: COLORS.textPrimary },
  msgImage: {
    width: 180, height: 130, borderRadius: 8, marginBottom: 8,
  },
  actionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  actionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primaryLight, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4,
  },
  actionText: { ...TYPO.caption, color: COLORS.primary, fontWeight: '700', fontSize: 11 },
  typingRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  typingBubble: {
    flexDirection: 'row', gap: 5, alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 18, padding: 12,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  typingDot: {
    width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primarySoft,
  },
  typingText: { ...TYPO.bodySmall, color: COLORS.textSecondary, fontStyle: 'italic', marginLeft: 4 },
  imagePreviewBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: COLORS.primaryLight, borderBottomWidth: 1, borderBottomColor: COLORS.primarySoft,
  },
  previewThumb: { width: 50, height: 50, borderRadius: 6 },
  previewLabel: { ...TYPO.buttonSmall, color: COLORS.primary, fontWeight: '700' },
  previewHint: { ...TYPO.caption, color: COLORS.textSecondary },
  removeImageBtn: { padding: 4 },
  quickActionsRow: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border,
    flexWrap: 'wrap',
  },
  quickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.background, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: COLORS.border,
  },
  quickBtnText: { ...TYPO.caption, color: COLORS.textPrimary, fontWeight: '600', fontSize: 11 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, paddingBottom: 28,
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  attachBtn: { padding: 4 },
  inputWrap: {
    flex: 1, backgroundColor: COLORS.background, borderRadius: SIZES.radiusXl,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  inputWrapFocused: {
    borderColor: COLORS.primary, backgroundColor: COLORS.surface, ...SHADOWS.inputFocus,
  },
  input: {
    ...TYPO.body, color: COLORS.textPrimary,
    paddingHorizontal: 14, paddingVertical: 10, maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center', ...SHADOWS.small,
  },
  sendBtnDisabled: { backgroundColor: COLORS.divider },
});
