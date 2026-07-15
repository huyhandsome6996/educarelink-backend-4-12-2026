import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  StatusBar, ActivityIndicator, KeyboardAvoidingView, Platform, Animated, ScrollView
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { sendHelpCenterMessage } from '../../api/tasks';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';
import FormattedText from '../../components/FormattedText';

const INITIAL_MESSAGES = [
  {
    id: 'welcome',
    role: 'assistant',
    text: '👋 Xin chào! Tôi là trợ lý AI của EduCareLink.\n\nTôi sẽ giúp bạn giải đáp mọi thắc mắc về cách sử dụng ứng dụng. Hãy chọn câu hỏi gợi ý bên dưới hoặc gõ câu hỏi của bạn 👇',
  },
];

const QUICK_QUESTIONS = [
  { label: 'Cách ứng tuyển việc?', icon: 'paper-plane-outline' },
  { label: 'Làm sao để gửi bằng cấp?', icon: 'ribbon-outline' },
  { label: 'Cách chỉnh sửa hồ sơ?', icon: 'create-outline' },
  { label: 'Tại sao tài khoản chưa được duyệt?', icon: 'time-outline' },
  { label: 'Khi nào nhận được tiền?', icon: 'wallet-outline' },
  { label: 'Cách huỷ việc đã ứng tuyển?', icon: 'close-circle-outline' },
];

const renderMessage = ({ item }) => {
  const isUser = item.role === 'user';
  return (
    <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowBot]}>
      {!isUser && (
        <View style={styles.botAvatar}>
          <Ionicons name="help-circle" size={18} color={COLORS.info} />
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

export default function HelpCenterScreen() {
  const navigation = useNavigation();
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
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

      const res = await sendHelpCenterMessage(text, historyForAPI);
      const botText = res.data.response || res.data.answer || 'Tôi đang được tích hợp. Vui lòng thử lại sau!';
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.botInfo}>
          <View style={styles.headerAvatar}>
            <Ionicons name="help-circle" size={22} color={COLORS.info} />
          </View>
          <View>
            <Text style={styles.headerName}>Trung tâm hỗ trợ</Text>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.headerStatus}>AI đang trực tuyến</Text>
            </View>
          </View>
        </View>
      </View>

      <FlatList ref={flatListRef} data={messages} keyExtractor={i => i.id}
        renderItem={renderMessage} contentContainerStyle={styles.list}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListHeaderComponent={React.useMemo(() => (
          <View>
            <Text style={styles.sectionLabel}>Câu hỏi phổ biến</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4, marginBottom: 8 }}>
              {QUICK_QUESTIONS.map((q, idx) => (
                <TouchableOpacity key={idx} style={styles.quickBtn} onPress={() => sendMessage(q.label)} activeOpacity={0.8}>
                  <Ionicons name={q.icon} size={12} color={COLORS.primary} />
                  <Text style={styles.quickText}>{q.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ), [])}
        ListFooterComponent={React.useMemo(() => isTyping ? (
          <View style={styles.typingRow}>
            <View style={styles.botAvatar}>
              <Ionicons name="help-circle" size={18} color={COLORS.info} />
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

      <View style={styles.inputBar}>
        <View style={[styles.inputWrap, inputFocused && styles.inputWrapFocused]}>
          <TextInput style={styles.input} placeholder="Mô tả vấn đề của bạn..." placeholderTextColor={COLORS.textMuted}
            value={input} onChangeText={setInput} multiline maxLength={500}
            onSubmitEditing={sendMessage}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)} />
        </View>
        <TouchableOpacity style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
          onPress={() => sendMessage()} disabled={!input.trim() || isTyping}>
          <Ionicons name="send" size={18} color={input.trim() ? '#fff' : COLORS.textMuted} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    backgroundColor: COLORS.surface, paddingHorizontal: 12, paddingTop: 56, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center',
  },
  botInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
    ...SHADOWS.small,
  },
  headerImage: { width: '100%', height: '100%' },
  headerName: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.success },
  headerStatus: { ...TYPO.caption, color: COLORS.success, fontWeight: '600' },
  list: { padding: SIZES.md, gap: 12, flexGrow: 1 },
  sectionLabel: { ...TYPO.overline, color: COLORS.textMuted, marginBottom: 8, fontWeight: '700' },
  quickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusXl,
    paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  quickText: { ...TYPO.caption, color: COLORS.primary, fontWeight: '600' },
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
    ...SHADOWS.cardHover, borderWidth: 1, borderColor: COLORS.border,
  },
  bubbleText: { ...TYPO.body },
  bubbleTextUser: { color: COLORS.textOnPrimary },
  bubbleTextBot: { color: COLORS.textPrimary },
  typingRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  typingBubble: {
    flexDirection: 'row', gap: 5, alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 18, padding: 12,
    ...SHADOWS.small, borderWidth: 1, borderColor: COLORS.border,
  },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primarySoft },
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
  inputWrapFocused: { borderColor: COLORS.primary, backgroundColor: COLORS.surface, ...SHADOWS.inputFocus },
  input: { ...TYPO.body, color: COLORS.textPrimary, paddingHorizontal: 16, paddingVertical: 10, maxHeight: 100 },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center', ...SHADOWS.small,
    boxShadow: '0px 2px 8px rgba(242, 101, 34, 0.3)',
  },
  sendBtnDisabled: { backgroundColor: COLORS.divider, boxShadow: 'none' },
});
