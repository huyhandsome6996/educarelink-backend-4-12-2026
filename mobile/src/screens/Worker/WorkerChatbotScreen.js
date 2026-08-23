import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  StatusBar, ActivityIndicator, KeyboardAvoidingView, Platform, Animated,
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sendWorkerChatMessage } from '../../api/tasks';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';
import FormattedText from '../../components/FormattedText';

const INITIAL_MESSAGES = [
  {
    id: 'welcome',
    role: 'assistant',
    text: '👋 Chào Carepartner! Tôi là trợ lý AI dành riêng cho bạn.\n\nBạn có thể hỏi tôi về:\n• "Cách ứng tuyển việc?"\n• "Làm sao để gửi bằng cấp?"\n• "Khi nào nhận được tiền?"\n• "Tại sao tài khoản chưa được duyệt?"\n\nTôi sẽ hỗ trợ bạn! 🚀',
  },
];

const QUICK_QUESTIONS = [
  { label: 'Cách ứng tuyển?', icon: 'paper-plane-outline' },
  { label: 'Gửi bằng cấp?', icon: 'ribbon-outline' },
  { label: 'Khi nào nhận tiền?', icon: 'wallet-outline' },
  { label: 'Tài khoản chưa duyệt?', icon: 'time-outline' },
];

export default function WorkerChatbotScreen() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
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
      const botText = res.data.response || 'AI đang được tích hợp. Vui lòng thử lại sau!';
      const botMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: botText,
      };

      chatHistoryRef.current.push({ role: 'assistant', text: botText });
      if (chatHistoryRef.current.length > 20) {
        chatHistoryRef.current = chatHistoryRef.current.slice(-20);
      }

      setMessages(prev => [...prev, botMsg]);
    } catch (e) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: '❌ Lỗi kết nối. Vui lòng kiểm tra mạng và thử lại.',
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const renderMessage = ({ item }) => {
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