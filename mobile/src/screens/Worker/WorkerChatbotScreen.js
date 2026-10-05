import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  StatusBar, ActivityIndicator, KeyboardAvoidingView, Platform, Animated,
  ScrollView, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { sendWorkerChatMessage } from '../../api/tasks';
import { addBlackout } from '../../api/matching';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';
import FormattedText from '../../components/FormattedText';

const INITIAL_MESSAGES = [
  {
    id: 'welcome',
    role: 'assistant',
    text: '👋 Chào Carepartner! Tôi là trợ lý AI dành riêng cho bạn.\n\nBạn có thể hỏi tôi về:\n• "Cách ứng tuyển việc?"\n• "Làm sao để gửi bằng cấp?"\n• "Khi nào nhận được tiền?"\n• "Tại sao tài khoản chưa được duyệt?"\n• Khai ngày bận nhanh: "thứ 5 tới mình bận cả ngày" — tôi tạo thẻ xác nhận, bạn duyệt mới lưu nhé!\n\nTôi sẽ hỗ trợ bạn! 🚀',
  },
];

const QUICK_QUESTIONS = [
  { label: 'Cách ứng tuyển?', icon: 'paper-plane-outline' },
  { label: 'Gửi bằng cấp?', icon: 'ribbon-outline' },
  { label: 'Khi nào nhận tiền?', icon: 'wallet-outline' },
  { label: 'Tài khoản chưa duyệt?', icon: 'time-outline' },
  { label: 'Khai ngày bận', icon: 'calendar-clear-outline' },
];

// 'YYYY-MM-DD' → 'DD/MM' (format vi-VN). Tách chuỗi thay vì new Date() để
// không dính lệch timezone (date 'YYYY-MM-DD' parse là UTC midnight).
const formatChipDate = (dateStr) => {
  if (!dateStr) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr));
  if (m) return `${m[3]}/${m[2]}`;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  return String(dateStr);
};

export default function WorkerChatbotScreen() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const navigation = useNavigation();
  const flatListRef = useRef(null);
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;
  const chatHistoryRef = useRef([]);

  // chatbot-fix-3: unmount-safe — chặn setState sau khi thoát màn
  // (pattern từ nhánh feature/ai-chatbot-flow12-migration, viết lại gọn)
  const isMountedRef = useRef(true);
  const savingBlackoutsRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
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

  const scrollToBottom = () => {
    setTimeout(() => flatListRef.current?.scrollToEnd?.({ animated: true }), 100);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const sendMessage = async (textArg) => {
    const text = (textArg || input).trim();
    if (!text) return;

    const userMsg = { id: Date.now().toString(), role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    chatHistoryRef.current.push({ role: 'user', text });

    try {
      const historyForAPI = chatHistoryRef.current.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        text: m.text
      }));

      const res = await sendWorkerChatMessage(text, historyForAPI);
      if (!isMountedRef.current) return;
      const data = res.data || {};
      const botText = data.response || 'AI đang được tích hợp. Vui lòng thử lại sau!';
      const botMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: botText,
      };

      // chatbot-fix-3 (§3 spec): AI phát hiện ngày bận → kèm danh sách
      // blackout để user duyệt 1-tap. Backend KHÔNG lưu — app gọi addBlackout
      // khi user bấm nút trên card.
      if (data.type === 'blackout_created' && Array.isArray(data.blackouts) && data.blackouts.length > 0) {
        botMsg.blackouts = data.blackouts;
        botMsg.state = 'pending'; // pending | saving | saved
      }

      chatHistoryRef.current.push({ role: 'assistant', text: botText });
      if (chatHistoryRef.current.length > 20) {
        chatHistoryRef.current = chatHistoryRef.current.slice(-20);
      }

      setMessages(prev => [...prev, botMsg]);
    } catch (e) {
      if (!isMountedRef.current) return;
      const errMsg =
        e?.response?.data?.response ||
        e?.response?.data?.error ||
        '❌ Lỗi kết nối. Vui lòng kiểm tra mạng và thử lại.';
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: errMsg,
      }]);
    } finally {
      if (isMountedRef.current) setIsTyping(false);
    }
  };

  // ===== LƯU NGÀY BẬN 1-TAP (POST /api/matching/carepartners/me/blackouts/)
  // Tuần tự addBlackout từng item — 409 coi là trùng lịch, bỏ qua.
  const handleSaveBlackouts = async (item) => {
    if (item.state !== 'pending' || savingBlackoutsRef.current) return;
    const patch = (p) => setMessages(prev => prev.map(m => (
      m.id === item.id ? { ...m, ...p } : m
    )));
    savingBlackoutsRef.current = true;
    patch({ state: 'saving' });

    let saved = 0;
    let skipped = 0;
    try {
      for (const b of item.blackouts || []) {
        try {
          await addBlackout({
            date: b.date,
            time_from: b.time_from ?? null,
            time_to: b.time_to ?? null,
            reason: b.reason,
            note: b.note || '',
          });
          saved += 1;
        } catch (e) {
          if (e?.response?.status === 409) {
            skipped += 1; // trùng đơn đã xác nhận — đã được bảo vệ sẵn, bỏ qua
          } else {
            if (!isMountedRef.current) return;
            Alert.alert(
              'Chưa lưu được',
              e?.response?.data?.detail || e?.response?.data?.error || 'Có lỗi khi lưu ngày bận. Bạn thử lại nhé.'
            );
          }
        }
      }
    } finally {
      savingBlackoutsRef.current = false;
    }

    if (!isMountedRef.current) return;
    const total = saved + skipped; // ngày bận đã được bảo vệ (kể cả trùng)
    if (total > 0) {
      patch({ state: 'saved', savedCount: total });
      Alert.alert(
        'Thành công',
        `Đã lưu ${total} ngày bận${skipped > 0 ? ` (${skipped} ngày trùng lịch đã có sẵn — bỏ qua)` : ''}. ELO của bạn được bảo vệ khỏi đề xuất trong ngày bận.`
      );
    } else {
      patch({ state: 'pending' }); // tất cả lỗi khác → cho thử lại
    }
  };

  const renderMessage = ({ item }) => {
    if (item.role === 'assistant' && item.blackouts) return renderBlackoutCard(item);
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

  // ===== CARD NGÀY BẬN (chatbot-fix-3 — §3 spec) =====
  const renderBlackoutCard = (item) => {
    const items = item.blackouts || [];
    const saved = item.state === 'saved';
    const saving = item.state === 'saving';
    return (
      <View style={[styles.msgRow, styles.msgRowBot]}>
        <View style={styles.botAvatar}>
          <Ionicons name="sparkles" size={18} color={COLORS.primary} />
        </View>
        <View style={[styles.bubble, styles.bubbleBot, styles.blackoutCard]}>
          {/* Giữ câu trả lời của AI để user không mất ngữ cảnh */}
          {item.text ? (
            <FormattedText
              text={item.text}
              style={[styles.bubbleText, styles.bubbleTextBot]}
              baseColor={COLORS.textPrimary}
            />
          ) : null}
          <Text style={styles.blackoutTitle}>
            {saved
              ? `✅ Đã lưu ${item.savedCount || items.length} ngày bận. ELO của bạn được bảo vệ khỏi đề xuất trong ngày bận.`
              : `🗓️ Phát hiện ${items.length} ngày bạn bận`}
          </Text>
          {items.map((b, idx) => (
            <View key={idx} style={styles.blackoutChip}>
              <View style={styles.blackoutChipDateWrap}>
                <Text style={styles.blackoutChipDate}>{formatChipDate(b.date)}</Text>
              </View>
              <View style={styles.blackoutChipBody}>
                <Text style={styles.blackoutChipTime}>
                  {b.time_from && b.time_to ? `${b.time_from}-${b.time_to}` : 'Cả ngày'}
                </Text>
                {b.reason_label_vi ? (
                  <Text style={styles.blackoutChipReason} numberOfLines={1}>
                    {b.reason_label_vi}{b.note ? ` · ${b.note}` : ''}
                  </Text>
                ) : b.note ? (
                  <Text style={styles.blackoutChipReason} numberOfLines={1}>{b.note}</Text>
                ) : null}
              </View>
            </View>
          ))}
          <TouchableOpacity
            style={[styles.blackoutSaveBtn, (saving || saved) && { opacity: 0.55 }]}
            onPress={() => handleSaveBlackouts(item)}
            disabled={saving || saved}
            testID="blackout-save"
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="shield-checkmark" size={16} color="#fff" />}
            <Text style={styles.blackoutSaveText}>Lưu vào Lịch Bận & Bảo vệ ELO</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.blackoutOpenBtn}
            onPress={() => {
              // Registry AppNavigator: tab 'MatchingAvailability' → stack 'Blackout'
              navigation.navigate('MatchingAvailability', { screen: 'Blackout' });
            }}
            disabled={saving}
            testID="blackout-open"
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={15} color={COLORS.primary} />
            <Text style={styles.blackoutOpenText}>Mở Lịch bận</Text>
          </TouchableOpacity>
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
          <Text style={styles.typingText}>AI đang suy nghĩ...</Text>
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
      <View style={styles.composer}>
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
          testID="chatbot-send"
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

  // ===== Card ngày bận (chatbot-fix-3) =====
  blackoutCard: {
    backgroundColor: COLORS.surface,
    maxWidth: '88%',
    gap: 8,
  },
  blackoutTitle: { fontSize: 14, fontWeight: '800', color: COLORS.textPrimary, lineHeight: 19 },
  blackoutChip: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: COLORS.primaryLight, borderRadius: 12,
    padding: 8, borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  blackoutChipDateWrap: {
    width: 46, height: 46, borderRadius: 10, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  blackoutChipDate: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  blackoutChipBody: { flex: 1 },
  blackoutChipTime: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
  blackoutChipReason: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1, flexShrink: 1 },
  blackoutSaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 11, marginTop: 2,
  },
  blackoutSaveText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  blackoutOpenBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderRadius: 12, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  blackoutOpenText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },

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