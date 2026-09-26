import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  StatusBar, ActivityIndicator, KeyboardAvoidingView, Platform, Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { sendChatMessage } from '../api/tasks';
import { COLORS, SHADOWS, SIZES, TYPO } from '../theme/colors';
import FormattedText from '../components/FormattedText';

const JOB_TYPE_META = {
  tutoring: { label: 'Gia sư', icon: 'book', color: '#F26522' },
  childcare: { label: 'Trông trẻ', icon: 'happy', color: '#8B5CF6' },
  pickup: { label: 'Đón trẻ', icon: 'car', color: '#2DB84B' },
};

const INITIAL_MESSAGES = [
  {
    id: 'welcome',
    role: 'assistant',
    text: '👋 Xin chào! Tôi là trợ lý AI của Educarelink.\n\nBạn chỉ cần mô tả nhu cầu, ví dụ:\n• "Tôi cần tìm gia sư Toán lớp 5 vào tối thứ 3 ở Quận 1"\n• "Cần người đón bé lúc 11h sáng"\n\nTôi sẽ hỏi nhanh vài câu rồi tạo tin đăng và quét ngay 8 Carepartner phù hợp nhất cho bạn! 🚀',
  },
];

export default function ChatbotScreen() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const navigation = useNavigation();
  const flatListRef = useRef(null);
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;

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

  const scrollToBottom = () => {
    // try/catch: scrollToEnd có thể ném khi FlatList chưa đo xong layout
    // (mới mount / resize) — cuộn là phụ, không được làm crash màn chat.
    setTimeout(() => {
      try {
        flatListRef.current?.scrollToEnd?.({ animated: true });
      } catch (e) { /* bỏ qua */ }
    }, 100);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const sendMessage = async () => {
    const text = input.trim();
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

      const res = await sendChatMessage(text, historyForAPI);
      const botText = res.data.response || 'AI đang được tích hợp. Vui lòng thử lại sau!';
      const botMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: botText,
      };
      // 2026-09-27: AI đăng việc hộ theo luồng ghép cặp mới — kèm JobPost
      if (res.data.job && res.data.job.id) {
        botMsg.job = res.data.job;
      } else if (res.data.task) {
        // LEGACY — server không còn trả task cũ
        const t = res.data.task;
        botMsg.text += `\n\n📋 Công việc đã tạo:\n• ${t.title}`;
      }

      chatHistoryRef.current.push({ role: 'assistant', text: botText });
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

  const renderJobCard = (job) => {
    const meta = JOB_TYPE_META[job.job_type] || JOB_TYPE_META.tutoring;
    const price = job.hourly_rate_vnd ? `${parseInt(job.hourly_rate_vnd).toLocaleString('vi-VN')}đ/giờ` : '';
    return (
      <View style={[styles.jobCard, { borderColor: `${meta.color}55` }]}>
        {/* Header: badge loại việc + giá */}
        <View style={styles.jobCardHeader}>
          <View style={styles.jobCardBadgeRow}>
            <View style={[styles.jobCardIconWrap, { backgroundColor: `${meta.color}1A` }]}>
              <Ionicons name={meta.icon} size={16} color={meta.color} />
            </View>
            <Text style={[styles.jobCardType, { color: COLORS.textSecondary }]}>{meta.label.toUpperCase()}</Text>
          </View>
          {price ? <Text style={[styles.jobCardPrice, { color: COLORS.primary }]}>{price}</Text> : null}
        </View>
        {/* Tiêu đề + lịch + địa điểm */}
        <Text style={styles.jobCardTitle} numberOfLines={2}>{job.title || 'Tin đăng mới'}</Text>
        <View style={styles.jobCardMetaRow}>
          {job.schedule ? (
            <View style={styles.jobCardMetaItem}>
              <Ionicons name="time-outline" size={13} color={COLORS.textMuted} />
              <Text style={styles.jobCardMetaText}>{job.schedule}</Text>
            </View>
          ) : null}
          {job.location_note ? (
            <View style={styles.jobCardMetaItem}>
              <Ionicons name="location-outline" size={13} color={COLORS.textMuted} />
              <Text style={styles.jobCardMetaText} numberOfLines={1}>{job.location_note}</Text>
            </View>
          ) : null}
        </View>
        {/* Radar pulse */}
        <View style={[styles.jobCardRadar, { backgroundColor: `${meta.color}0D` }]}>
          <View style={[styles.radarDot, { backgroundColor: meta.color }]} />
          <Text style={[styles.jobCardRadarText, { color: meta.color }]}>
            AI đang quét Carepartner phù hợp nhất…
          </Text>
        </View>
        {/* CTA — sang radar ứng viên */}
        <TouchableOpacity
          style={[styles.jobCardCta, { backgroundColor: COLORS.primary }]}
          onPress={() => {
            // ChatbotScreen là tab trung tâm → bubble sang stack Trang chủ
            navigation.navigate('ParentHome', {
              screen: 'CandidatesList',
              params: { jobId: job.id },
            });
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="radar" size={17} color="#fff" />
          <Text style={styles.jobCardCtaText}>Xem ứng viên đề xuất</Text>
        </TouchableOpacity>
      </View>
    );
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
            <View>
              <FormattedText
                text={item.text}
                style={[styles.bubbleText, styles.bubbleTextBot]}
                baseColor={COLORS.textPrimary}
              />
              {/* 2026-09-27: Job Card luồng ghép cặp mới */}
              {item.job ? <View style={{ marginTop: 10 }}>{renderJobCard(item.job)}</View> : null}
            </View>
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

  // Data cho FlatList = messages + typing indicator
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
            <Text style={styles.headerName}>AI Trợ lý Educarelink</Text>
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
        onContentSizeChange={() => {
          if (!listData.length) return;
          try {
            flatListRef.current?.scrollToEnd?.({ animated: false });
          } catch (e) { /* bỏ qua — list chưa đo xong layout */ }
        }}
      />

      {/* Input bar */}
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
          onPress={sendMessage}
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

  // ===== Job Card (luồng ghép cặp mới — 2026-09-27) =====
  jobCard: {
    borderRadius: 14, borderWidth: 2, backgroundColor: COLORS.surface,
    padding: 12,
  },
  jobCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
  jobCardBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  jobCardIconWrap: {
    width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  jobCardType: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  jobCardPrice: { fontSize: 15, fontWeight: '800' },
  jobCardTitle: {
    fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, lineHeight: 20,
    marginBottom: 6,
  },
  jobCardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  jobCardMetaItem: {
    flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1,
  },
  jobCardMetaText: { fontSize: 12, color: COLORS.textMuted, flexShrink: 1 },
  jobCardRadar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 10,
  },
  radarDot: { width: 9, height: 9, borderRadius: 5 },
  jobCardRadarText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  jobCardCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: 12, paddingVertical: 11, marginTop: 10,
  },
  jobCardCtaText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});