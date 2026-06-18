import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  StatusBar, ActivityIndicator, KeyboardAvoidingView, Platform, Animated
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { sendChatMessage } from '../api/tasks';
import { COLORS, SHADOWS, SIZES, TYPO } from '../theme/colors';

const INITIAL_MESSAGES = [
  {
    id: 'welcome',
    role: 'assistant',
    text: '👋 Xin chào! Tôi là trợ lý AI của Educarelink.\n\nBạn có thể nói với tôi như:\n• "Tôi cần tìm gia sư Toán lớp 5 vào tối thứ 3 ở Quận 1"\n• "Cần người đón bé lúc 11h sáng"\n\nTôi sẽ giúp bạn tạo công việc nhanh chóng! 🚀',
  },
];

const renderMessage = ({ item }) => {
  const isUser = item.role === 'user';
  return (
    <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowBot]}>
      {!isUser && (
        <View style={styles.botAvatar}>
          <Image source={require('../../assets/images/icon_ai_bot.png')} style={styles.botImage} resizeMode="contain" />
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
        <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextBot]}>
          {item.text}
        </Text>
      </View>
    </View>
  );
};

export default function ChatbotScreen() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const flatListRef = useRef(null);
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;

  // Lịch sử hội thoại để gửi kèm cho AI hiểu ngữ cảnh
  // Chỉ lưu tối đa 20 tin nhắn gần nhất để tránh request quá lớn
  const chatHistoryRef = useRef([]);

  // Typing dots animation
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

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;

    const userMsg = { id: Date.now().toString(), role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Lưu tin nhắn người dùng vào lịch sử
    chatHistoryRef.current.push({ role: 'user', text });

    try {
      // Gửi lịch sử hội thoại cho backend (đổi 'assistant' → 'model' cho Gemini API)
      const historyForAPI = chatHistoryRef.current.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        text: m.text
      }));

      const res = await sendChatMessage(text, historyForAPI);
      // Backend returns: { response: "...", type: "message"|"task_created"|"clarification"|"error", task?: {...} }
      const botText = res.data.response || 'AI đang được tích hợp. Vui lòng thử lại sau!';
      const botMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: botText,
      };
      // If AI created a task, append task info to the message
      if (res.data.task) {
        const t = res.data.task;
        botMsg.text += `\n\n📋 Công việc đã tạo:\n• ${t.title}\n• 💰 ${parseInt(t.price).toLocaleString('vi-VN')}đ\n• 📍 ${t.location || 'Chưa xác định'}\n• 📅 ${t.scheduled_time ? new Date(t.scheduled_time).toLocaleString('vi-VN') : 'Chưa xác định'}`;
      }

      // Lưu phản hồi AI vào lịch sử
      chatHistoryRef.current.push({ role: 'assistant', text: botText });

      // Giới hạn lịch sử tối đa 20 tin nhắn
      if (chatHistoryRef.current.length > 20) {
        chatHistoryRef.current = chatHistoryRef.current.slice(-20);
      }

      setMessages(prev => [...prev, botMsg]);
    } catch (e) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: '❌ Lỗi kết nối. Vui lòng kiểm tra lại kết nối mạng.',
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

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={88}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      <View style={styles.header}>
        <View style={styles.botInfo}>
          <View style={styles.headerAvatar}>
            <Image source={require('../../assets/images/icon_ai_bot.png')} style={styles.headerImage} resizeMode="contain" />
          </View>
          <View>
            <Text style={styles.headerName}>AI Trợ lý Educarelink</Text>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.headerStatus}>Đang hoạt động</Text>
            </View>
          </View>
        </View>
      </View>

      <FlatList ref={flatListRef} data={messages} keyExtractor={i => i.id}
        renderItem={renderMessage} contentContainerStyle={styles.list}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListFooterComponent={React.useMemo(() => isTyping ? (
          <View style={styles.typingRow}>
            <View style={styles.botAvatar}>
              <Image source={require('../../assets/images/icon_ai_bot.png')} style={styles.botImage} resizeMode="contain" />
            </View>
            <View style={styles.typingBubble}>
              <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }]} />
              <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot2Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }]} />
              <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot3Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }]} />
              <Text style={styles.typingText}>AI đang suy nghĩ...</Text>
            </View>
          </View>
        ) : null, [isTyping, dot1Anim, dot2Anim, dot3Anim])}
      />

      {/* Input bar */}
      <View style={styles.inputBar}>
        <View style={[styles.inputWrap, inputFocused && styles.inputWrapFocused]}>
          <TextInput style={styles.input} placeholder="Nhắn tin cho AI..." placeholderTextColor={COLORS.textMuted}
            value={input} onChangeText={setInput} multiline maxLength={500}
            onSubmitEditing={sendMessage}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)} />
        </View>
        <TouchableOpacity style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
          onPress={sendMessage} disabled={!input.trim() || isTyping}>
          <Ionicons name="send" size={18} color={input.trim() ? '#fff' : COLORS.textMuted} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    backgroundColor: COLORS.surface, paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  botInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
    ...SHADOWS.small,
  },
  headerImage: { width: '100%', height: '100%' },
  headerName: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  headerStatus: { ...TYPO.caption, color: COLORS.success, fontWeight: '600' },
  list: { padding: SIZES.md, gap: 12, flexGrow: 1 },
  msgRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowBot: { justifyContent: 'flex-start' },
  botAvatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0, overflow: 'hidden',
  },
  botImage: { width: '100%', height: '100%' },
  bubble: { maxWidth: '78%', borderRadius: 18, padding: 12 },
  bubbleUser: {
    backgroundColor: COLORS.primary, borderBottomRightRadius: 4,
    ...SHADOWS.small,
    boxShadow: '0px 2px 8px rgba(242, 101, 34, 0.25)',
  },
  bubbleBot: {
    backgroundColor: COLORS.surface, borderBottomLeftRadius: 4,
    ...SHADOWS.cardHover,
    borderWidth: 1, borderColor: COLORS.border,
  },
  bubbleText: { ...TYPO.body },
  bubbleTextUser: { color: COLORS.textOnPrimary },
  bubbleTextBot: { color: COLORS.textPrimary },
  typingRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  typingBubble: {
    flexDirection: 'row', gap: 5, alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 18, padding: 12,
    ...SHADOWS.small,
    borderWidth: 1, borderColor: COLORS.border,
  },
  typingDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: COLORS.primarySoft,
  },
  typingText: { ...TYPO.bodySmall, color: COLORS.textSecondary, fontStyle: 'italic', marginLeft: 4 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 28,
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  inputWrap: {
    flex: 1, backgroundColor: COLORS.background, borderRadius: SIZES.radiusXl,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  inputWrapFocused: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
    ...SHADOWS.inputFocus,
  },
  input: {
    ...TYPO.body, color: COLORS.textPrimary,
    paddingHorizontal: 16, paddingVertical: 10, maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.small,
    boxShadow: '0px 2px 8px rgba(242, 101, 34, 0.3)',
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.divider,
    boxShadow: 'none',
  },
});
