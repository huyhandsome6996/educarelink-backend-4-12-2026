import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  StatusBar, ActivityIndicator, KeyboardAvoidingView, Platform, Animated,
  ScrollView, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sendWorkerChatMessage } from '../../api/tasks';
import { addBlackout } from '../../api/matching';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';
import FormattedText from '../../components/FormattedText';

const INITIAL_MESSAGES = [
  {
    id: 'welcome',
    role: 'assistant',
    text: '👋 Chào Carepartner! Tôi là trợ lý AI dành riêng cho bạn.\n\nBạn có thể:\n• Hỏi cách ứng tuyển, gửi bằng cấp, nhận tiền\n• Hỏi "vì sao mình chưa được ghép việc?" — tôi phân tích theo số liệu thật của bạn\n• Khai ngày bận nhanh: "thứ 5 tới mình bận cả ngày" — tôi tạo thẻ xác nhận 1 chạm, bạn duyệt mới lưu nhé!\n\nTôi sẽ hỗ trợ bạn! 🚀',
  },
];

const QUICK_QUESTIONS = [
  { label: 'Vì sao chưa được ghép việc?', icon: 'radar' },
  { label: 'Khai ngày bận', icon: 'event-busy' },
  { label: 'Cách ứng tuyển?', icon: 'paper-plane-outline' },
  { label: 'Khi nào nhận tiền?', icon: 'wallet-outline' },
];

// Pattern an toàn useSafeAreaInsets đã chuẩn hoá (MapPickerModal.js)
function useSafeInsets() {
  let insets = { top: 12, bottom: 20, left: 0, right: 0 };
  try {
    const safeInsets = useSafeAreaInsets();
    if (safeInsets) insets = safeInsets;
  } catch {}
  return insets;
}

export default function WorkerChatbotScreen() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef(null);
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;
  const chatHistoryRef = useRef([]);

  // Brief 4.3: mounted guard + huỷ request khi thoát màn hình
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef(null);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort?.();
    };
  }, []);

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

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd?.({ animated: true }), 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  const sendMessage = async (textArg) => {
    const text = (textArg || input).trim();
    if (!text || isTyping) return;

    const userMsg = { id: `u${Date.now()}`, role: 'user', text };
    if (isMountedRef.current) {
      setMessages(prev => [...prev, userMsg]);
      setInput('');
      setIsTyping(true);
    }

    chatHistoryRef.current.push({ role: 'user', text });

    abortControllerRef.current?.abort?.();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const historyForAPI = chatHistoryRef.current.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        text: m.text,
      }));

      const res = await sendWorkerChatMessage(text, historyForAPI, {
        signal: controller.signal,
      });
      if (!isMountedRef.current) return;

      const data = res.data || {};
      const botText = data.response || 'AI không trả lời được, bạn thử lại nhé!';
      const botMsg = { id: `b${Date.now()}`, role: 'assistant', text: botText };

      // ===== FLOW 1/2 — card khai bận xác nhận 1-tap (brief 3.1) =====
      if (data.type === 'blackout_action' && data.blackout_action) {
        if (isMountedRef.current) {
          setMessages(prev => [...prev, botMsg, {
            id: `blk${Date.now()}`,
            role: 'blackout_card',
            action: data.blackout_action,
            state: 'pending', // pending | saving | saved
          }]);
        }
      } else if (isMountedRef.current) {
        setMessages(prev => [...prev, botMsg]);
      }

      chatHistoryRef.current.push({ role: 'assistant', text: botText });
      if (chatHistoryRef.current.length > 20) {
        chatHistoryRef.current = chatHistoryRef.current.slice(-20);
      }
    } catch (e) {
      if (!isMountedRef.current) return;
      if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
      if (isMountedRef.current) {
        setMessages(prev => [...prev, {
          id: `b${Date.now()}`,
          role: 'assistant',
          text: '❌ Lỗi kết nối. Vui lòng kiểm tra mạng và thử lại.',
        }]);
      }
    } finally {
      if (isMountedRef.current) setIsTyping(false);
    }
  };

  // ===== XÁC NHẬN KHAI BẬN (1-tap — POST endpoint chuẩn, brief 3.1/3.2) =====
  const handleConfirmBlackout = async (item) => {
    if (item.state !== 'pending') return;
    const patch = (patchData) => setMessages(prev => prev.map(m => (
      m.id === item.id ? { ...m, ...patchData } : m
    )));
    patch({ state: 'saving' });
    try {
      const a = item.action;
      const res = await addBlackout({
        date: a.date,
        time_from: a.time_from,
        time_to: a.time_to,
        reason: a.reason,
        note: a.note || '',
      });
      if (!isMountedRef.current) return;
      const merged = res.data?.merged;
      patch({ state: 'saved' });
      Alert.alert(
        'Đã lưu ngày bận',
        merged
          ? 'Ngày bận này trùng lịch có sẵn — đã gộp lại cho gọn nhé.'
          : 'CarePartner khác sẽ không được ghép với bạn trong khoảng thời gian này.',
      );
    } catch (e) {
      if (!isMountedRef.current) return;
      patch({ state: 'pending' });
      const detail = e?.response?.data?.detail;
      if (e?.response?.status === 409) {
        Alert.alert('Trùng đơn đã xác nhận', detail || 'Hãy hủy hoặc đổi giờ đơn trước khi khai bận.');
      } else {
        Alert.alert('Lỗi', detail || 'Không lưu được ngày bận. Bạn thử lại nhé.');
      }
    }
  };

  const renderMessage = ({ item }) => {
    if (item.role === 'blackout_card') return renderBlackoutCard(item);
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowBot]}>
        {!isUser && (
          <View style={styles.botAvatar}>
            <Ionicons name="sparkles" size={18} color={COLORS.primary} />
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
          {isUser ? (
            <Text style={[styles.bubbleText, styles.bubbleTextUser]}>
              {item.text}
            </Text>
          ) : (
            <FormattedText
              text={item.text}
              style={[styles.bubbleText, styles.bubbleTextBot]}
              baseColor={COLORS.textPrimary}
            />
          )}
        </View>
      </View>
    );
  };

  const renderBlackoutCard = (item) => {
    const a = item.action || {};
    const khung = a.time_from && a.time_to ? `${a.time_from} - ${a.time_to}` : 'Bận cả ngày';
    return (
      <View style={styles.msgRow}>
        <View style={styles.botAvatar}>
          <Ionicons name="sparkles" size={18} color={COLORS.primary} />
        </View>
        <View style={styles.blackoutCard}>
          <View style={styles.blackoutHeader}>
            <Ionicons name="calendar-clear" size={16} color={COLORS.primary} />
            <Text style={styles.blackoutTitle}>Xác nhận khai ngày bận</Text>
          </View>
          <View style={styles.blackoutMeta}>
            <Text style={styles.blackoutMetaText}><Text style={styles.blackoutMetaLabel}>Ngày: </Text>{a.date}</Text>
            <Text style={styles.blackoutMetaText}><Text style={styles.blackoutMetaLabel}>Khung giờ: </Text>{khung}</Text>
            <Text style={styles.blackoutMetaText}><Text style={styles.blackoutMetaLabel}>Lý do: </Text>{a.reason_label || 'Khác'}</Text>
            {a.note ? <Text style={styles.blackoutMetaText} numberOfLines={2}><Text style={styles.blackoutMetaLabel}>Ghi chú: </Text>{a.note}</Text> : null}
          </View>
          {a.conflicts_with_booking ? (
            <View style={styles.conflictBox}>
              <Text style={styles.conflictText}>
                ⚠️ Ngày này bạn đang có đơn đã xác nhận — cần hủy hoặc đổi giờ đơn trước khi khai bận.
              </Text>
            </View>
          ) : null}
          {item.state === 'saved' ? (
            <View style={[styles.blackoutBtn, styles.blackoutBtnDone]}>
              <Ionicons name="checkmark-circle" size={16} color="#fff" />
              <Text style={styles.blackoutBtnText}>Đã lưu ngày bận</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.blackoutBtn, item.state === 'saving' && { opacity: 0.5 }]}
              disabled={item.state === 'saving'}
              onPress={() => handleConfirmBlackout(item)}
              activeOpacity={0.85}
            >
              {item.state === 'saving'
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="checkmark-circle" size={16} color="#fff" />}
              <Text style={styles.blackoutBtnText}>Xác nhận khai bận</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderTyping = () => {
    if (!isTyping) return null;
    return (
      <View style={styles.msgRow}>
        <View style={styles.botAvatar}>
          <Ionicons name="sparkles" size={18} color={COLORS.primary} />
        </View>
        <View style={styles.typingBubble}>
          <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }]} />
          <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot2Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }]} />
          <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot3Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }]} />
          <Text style={styles.typingText}>Đang suy nghĩ...</Text>
        </View>
      </View>
    );
  };

  const QuickQuestions = () => (
    <View style={styles.quickRow}>
      {QUICK_QUESTIONS.map((q, idx) => (
        <TouchableOpacity key={idx} style={styles.quickBtn} onPress={() => sendMessage(q.label)} activeOpacity={0.8}>
          <Ionicons name={q.icon} size={12} color={COLORS.primary} />
          <Text style={styles.quickText}>{q.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const insets = useSafeInsets();
  const listData = isTyping ? [...messages, { id: 'typing', role: 'typing' }] : messages;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.botInfo}>
          <View style={styles.headerAvatar}>
            <Ionicons name="sparkles" size={22} color={COLORS.primary} />
          </View>
          <View>
            <Text style={styles.headerName}>AI Trợ lý Carepartner</Text>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.headerStatus}>Đang hoạt động</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Danh sách tin nhắn */}
      <FlatList
        ref={flatListRef}
        data={listData}
        keyExtractor={i => i.id}
        renderItem={({ item }) => {
          if (item.role === 'typing') return renderTyping();
          return renderMessage({ item });
        }}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<QuickQuestions />}
        onContentSizeChange={() => {
          if (listData.length) flatListRef.current?.scrollToEnd?.({ animated: false });
        }}
      />

      {/* Input bar — giống pattern ChatScreen */}
      <View style={[styles.composer, { paddingBottom: 10 + insets.bottom * 0.3 }]}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Nhắn tin cho AI..."
          placeholderTextColor={COLORS.textMuted}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || isTyping) && { opacity: 0.4 }]}
          onPress={() => sendMessage()}
          disabled={!input.trim() || isTyping}
          testID="chat-send-btn"
        >
          {isTyping
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="send" size={20} color="#fff" />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // Header
  header: {
    backgroundColor: COLORS.surface, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  botInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
    ...SHADOWS.small,
  },
  headerName: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.success },
  headerStatus: { ...TYPO.caption, color: COLORS.success, fontWeight: '600' },

  // Messages
  listContent: { padding: 14, paddingBottom: 20 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  quickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusXl,
    paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  quickText: { ...TYPO.caption, color: COLORS.primary, fontWeight: '600' },
  msgRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginBottom: 10 },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowBot: { justifyContent: 'flex-start' },
  botAvatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0, overflow: 'hidden',
  },
  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: {
    backgroundColor: COLORS.primary, borderBottomRightRadius: 4,
  },
  bubbleBot: {
    backgroundColor: COLORS.surface, borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: COLORS.border,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextUser: { color: '#fff' },
  bubbleTextBot: { color: COLORS.textPrimary },

  // ===== CARD KHAI BẬN 1-TAP (Flow 1/2) =====
  blackoutCard: {
    width: '82%', backgroundColor: COLORS.surface, borderRadius: 18,
    borderWidth: 1, borderColor: COLORS.border, padding: 14,
    ...SHADOWS.small,
  },
  blackoutHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  blackoutTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  blackoutMeta: { gap: 3, marginBottom: 10 },
  blackoutMetaText: { fontSize: 12.5, color: COLORS.textPrimary },
  blackoutMetaLabel: { fontWeight: '700', color: COLORS.textSecondary },
  conflictBox: {
    backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1,
    borderRadius: 12, padding: 8, marginBottom: 10,
  },
  conflictText: { fontSize: 11.5, color: '#B45309', lineHeight: 16 },
  blackoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 11,
  },
  blackoutBtnDone: { backgroundColor: COLORS.success },
  blackoutBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Typing
  typingBubble: {
    flexDirection: 'row', gap: 5, alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 18, padding: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primarySoft },
  typingText: { ...TYPO.bodySmall, color: COLORS.textSecondary, fontStyle: 'italic', marginLeft: 4 },

  // Composer — giống hệt ChatScreen
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 10, backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  input: {
    flex: 1, minHeight: 42, maxHeight: 110, borderRadius: 21,
    backgroundColor: '#F3F4F6', paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: COLORS.textPrimary, paddingTop: 12,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
});
