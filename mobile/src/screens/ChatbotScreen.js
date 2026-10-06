import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  StatusBar, ActivityIndicator, KeyboardAvoidingView, Platform, Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { sendChatMessage } from '../api/tasks';
import { COLORS, SHADOWS, TYPO } from '../theme/colors';
import FormattedText from '../components/FormattedText';

const JOB_TYPE_META = {
  tutoring: { label: 'Gia sư', icon: 'book', color: '#F26522' },
  childcare: { label: 'Đồng hành cùng trẻ', icon: 'happy', color: '#8B5CF6' },
  pickup: { label: 'Đón trẻ', icon: 'car', color: '#2DB84B' },
};

const QUICK_PROMPTS = [
  { icon: 'book-outline', title: 'Tìm gia sư', prompt: 'Tôi cần gia sư lớp 5 môn Toán và Tiếng Việt vào tối nay. Bạn tư vấn mức giá và giúp tôi tìm người phù hợp nhé.' },
  { icon: 'happy-outline', title: 'Đồng hành cùng trẻ', prompt: 'Tôi cần CarePartner đồng hành cùng bé. Bạn cần tôi cung cấp những thông tin gì?' },
  { icon: 'car-outline', title: 'Đón bé tan học', prompt: 'Tôi cần người đón bé tan học. Hãy giúp tôi tạo yêu cầu.' },
];


export default function ChatbotScreen() {
  const [messages, setMessages] = useState([]);
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
      // chatbot-fix-3: backend soạn sẵn message thân thiện (vd 503 quota /
      // high-demand) — không nuốt nữa. Pattern đúng: AdminChatbotScreen.js:164.
      const errMsg =
        e?.response?.data?.response ||
        e?.response?.data?.error ||
        '❌ Lỗi kết nối. Vui lòng kiểm tra lại kết nối mạng.';
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: errMsg,
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const renderJobCard = (job) => {
    const meta = JOB_TYPE_META[job.job_type] || JOB_TYPE_META.tutoring;
    const price = job.hourly_rate_vnd ? `${parseInt(job.hourly_rate_vnd).toLocaleString('vi-VN')}đ/giờ` : '';
    // chatbot-fix-3: publish-fail (ai_failed / needs_admin_review) → biến thể
    // cảnh báo thay vì radar + CTA ứng viên (job chưa vào radar được).
    const needsReview = job.status && job.status !== 'ai_parsed';
    const preview = !needsReview && Array.isArray(job.candidates_preview)
      ? job.candidates_preview.slice(0, 3)
      : [];

    // Radar text theo total_matched (hợp đồng backend 2026-09-27)
    let radarText = 'AI đang quét Carepartner phù hợp nhất…';
    if (typeof job.total_matched === 'number' && job.total_matched > 0) {
      radarText = `🎉 AI đã quét thấy ${job.total_matched} CarePartner phù hợp!`;
    } else if (job.total_matched === 0) {
      radarText = 'Chưa có CarePartner nào khớp ca này — hệ thống tiếp tục quét...';
    }

    return (
      <View
        style={[
          styles.jobCard,
          { borderColor: needsReview ? `${COLORS.warning}66` : `${meta.color}55` },
          needsReview && styles.jobCardWarningCard,
        ]}
      >
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

        {needsReview ? (
          <>
            {/* Cảnh báo publish-fail — nền vàng nhạt + icon ⚠️ */}
            <View style={styles.jobCardWarning}>
              <Text style={styles.jobCardWarningIcon}>⚠️</Text>
              <View style={styles.jobCardWarningBody}>
                <Text style={styles.jobCardWarningTitle}>
                  {job.status_label_vi || 'Tin đăng đang được xử lý lại'}
                </Text>
                <Text style={styles.jobCardWarningText}>
                  Đang xử lý lại tin đăng — theo dõi trong mục Việc của tôi
                </Text>
              </View>
            </View>
            {/* CTA duy nhất — không radar, không CTA ứng viên */}
            <TouchableOpacity
              style={[styles.jobCardCta, { backgroundColor: COLORS.warning }]}
              onPress={() => {
                // Registry AppNavigator: tab 'MyTasks' → stack 'MyTasksMain'
                // ('MyJobs' là màn của SINH VIÊN — dùng cho parent sẽ crash)
                navigation.navigate('MyTasks', { screen: 'MyTasksMain' });
              }}
              testID="jobcard-my-jobs"
              activeOpacity={0.85}
            >
              <Ionicons name="briefcase-outline" size={17} color="#fff" />
              <Text style={styles.jobCardCtaText}>Xem trong Việc của tôi</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Radar pulse */}
            <View style={[styles.jobCardRadar, { backgroundColor: `${meta.color}0D` }]}>
              <View style={[styles.radarDot, { backgroundColor: meta.color }]} />
              <Text style={[styles.jobCardRadarText, { color: meta.color }]}>
                {radarText}
              </Text>
            </View>
            {/* Preview ứng viên (top 3 — hợp đồng candidates_preview) */}
            {preview.length > 0 ? (
              <View style={styles.jobCardPreview}>
                {preview.map((c, idx) => (
                  <Text key={idx} style={styles.jobCardPreviewRow} numberOfLines={1}>
                    {`• ${c.display_name} · ${c.school} · ★${c.rating} · ${c.distance_km}km`}
                  </Text>
                ))}
              </View>
            ) : null}
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
          </>
        )}
      </View>
    );
  };

  const renderMessage = ({ item }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowBot]}>
        {!isUser && (
          <View style={styles.botAvatar}>
            <Ionicons name="sparkles" size={16} color={COLORS.primaryDeep} />
          </View>
        )}
        <View style={[styles.messageColumn, isUser && styles.userColumn]}>
          <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
            {isUser ? (
              <Text style={[styles.bubbleText, styles.bubbleTextUser]}>{item.text}</Text>
            ) : (
              <FormattedText
                text={item.text}
                style={[styles.bubbleText, styles.bubbleTextBot]}
                baseColor={COLORS.onSurface}
              />
            )}
          </View>
          {item.job ? renderJobCard(item.job) : null}
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

  // Các gợi ý chỉ điền nội dung; phụ huynh kiểm tra và chủ động gửi.
  const renderWelcome = () => {
    if (messages.length > 0 || isTyping) return null;
    return (
      <View style={styles.welcome}>
        <View style={styles.heroIcon}>
          <Ionicons name="sparkles" size={26} color={COLORS.primaryDeep} />
        </View>
        <Text style={styles.eyebrow}>TRỢ LÝ EDUCARELINK</Text>
        <Text style={styles.heroTitle}>Tìm người đồng hành{ '\n' }cho bé thật dễ dàng</Text>
        <Text style={styles.heroDescription}>
          Kể mình nghe nhu cầu của gia đình. Mình sẽ tư vấn, hỏi thêm thông tin cần thiết và giúp bạn tìm CarePartner phù hợp.
        </Text>
        <Text style={styles.suggestionTitle}>BẠN CÓ THỂ BẮT ĐẦU VỚI</Text>
        {QUICK_PROMPTS.map((item) => (
          <TouchableOpacity
            key={item.title}
            style={styles.suggestionCard}
            onPress={() => setInput(item.prompt)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={item.title}
          >
            <View style={styles.suggestionIcon}>
              <Ionicons name={item.icon} size={19} color={COLORS.primaryDeep} />
            </View>
            <Text style={styles.suggestionText}>{item.title}</Text>
            <Ionicons name="arrow-forward" size={18} color={COLORS.primaryDeep} />
          </TouchableOpacity>
        ))}
        <View style={styles.assurance}>
          <Ionicons name="shield-checkmark-outline" size={15} color={COLORS.successDeep} />
          <Text style={styles.assuranceText}>Bạn luôn kiểm tra thông tin trước khi đăng việc.</Text>
        </View>
      </View>
    );
  };

  const listData = isTyping ? [...messages, { id: 'typing', role: 'typing' }] : messages;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceWarm} />

      <View style={styles.header}>
        <View style={styles.headerAvatar}>
          <Ionicons name="sparkles" size={21} color={COLORS.primaryDeep} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>Trợ lý EduCare</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.headerStatus}>Sẵn sàng hỗ trợ</Text>
          </View>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>AI</Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={listData}
        keyExtractor={item => item.id}
        renderItem={({ item }) => item.role === 'typing' ? renderTyping() : renderMessage({ item })}
        ListHeaderComponent={renderWelcome}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          if (!listData.length) return;
          try {
            flatListRef.current?.scrollToEnd?.({ animated: false });
          } catch (e) { /* bỏ qua — list chưa đo xong layout */ }
        }}
      />

      <View style={styles.composer}>
        <View style={styles.inputShell}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Kể mình nghe nhu cầu của bạn..."
            placeholderTextColor={COLORS.onSurfaceVariant}
            multiline
            maxLength={500}
            accessibilityLabel="Nội dung nhắn cho trợ lý EduCare"
          />
        </View>
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || isTyping) && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!input.trim() || isTyping}
          testID="chatbot-send"
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Gửi tin nhắn"
        >
          {isTyping
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="arrow-up" size={22} color="#fff" />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20,
    paddingTop: 12, paddingBottom: 14, backgroundColor: COLORS.surfaceWarm,
    borderBottomWidth: 1, borderBottomColor: COLORS.surfaceContainer,
  },
  headerAvatar: {
    width: 44, height: 44, borderRadius: 16, backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center', justifyContent: 'center',
  },
  headerInfo: { flex: 1, paddingLeft: 11 },
  headerName: { ...TYPO.h4, color: COLORS.onSurface },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.successDeep },
  headerStatus: { ...TYPO.bodySmall, color: COLORS.successDeep },
  headerBadge: {
    backgroundColor: COLORS.surfaceContainerLow, borderRadius: 8,
    paddingHorizontal: 9, paddingVertical: 5,
  },
  headerBadgeText: { ...TYPO.overline, color: COLORS.primaryDeep },

  listContent: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 28 },
  welcome: { paddingTop: 14, paddingBottom: 18 },
  heroIcon: {
    width: 54, height: 54, borderRadius: 18, backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center', justifyContent: 'center', marginBottom: 19,
  },
  eyebrow: { ...TYPO.overline, color: COLORS.primaryDeep, marginBottom: 8 },
  heroTitle: { ...TYPO.h1, color: COLORS.onSurface, marginBottom: 10 },
  heroDescription: { ...TYPO.body, color: COLORS.onSurfaceVariant, marginBottom: 26 },
  suggestionTitle: { ...TYPO.overline, color: COLORS.onSurfaceVariant, marginBottom: 11 },
  suggestionCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
    borderRadius: 17, paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 9, borderWidth: 1, borderColor: COLORS.surfaceContainer,
    ...SHADOWS.small,
  },
  suggestionIcon: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  suggestionText: { ...TYPO.buttonSmall, color: COLORS.onSurface, flex: 1 },
  assurance: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  assuranceText: { ...TYPO.bodySmall, color: COLORS.onSurfaceVariant, flex: 1 },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 18 },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowBot: { justifyContent: 'flex-start' },
  botAvatar: {
    width: 30, height: 30, borderRadius: 11, backgroundColor: COLORS.surfaceContainerLow,
    justifyContent: 'center', alignItems: 'center', marginRight: 8, flexShrink: 0,
  },
  messageColumn: { flexShrink: 1, maxWidth: '88%', alignItems: 'flex-start' },
  userColumn: { alignItems: 'flex-end' },
  bubble: { borderRadius: 18, paddingHorizontal: 15, paddingVertical: 12 },
  bubbleUser: { backgroundColor: COLORS.primary, borderBottomRightRadius: 5 },
  bubbleBot: {
    backgroundColor: COLORS.surface, borderBottomLeftRadius: 5,
    borderWidth: 1, borderColor: COLORS.surfaceContainer,
  },
  bubbleText: { ...TYPO.body, lineHeight: 23 },
  bubbleTextUser: { color: COLORS.surface },
  bubbleTextBot: { color: COLORS.onSurface },

  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.surface, borderRadius: 18, borderBottomLeftRadius: 5,
    paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1,
    borderColor: COLORS.surfaceContainer,
  },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primary },
  typingText: { ...TYPO.bodySmall, color: COLORS.onSurfaceVariant, marginLeft: 5 },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 9,
    paddingHorizontal: 15, paddingTop: 10, paddingBottom: 12,
    backgroundColor: COLORS.surface, borderTopWidth: 1,
    borderTopColor: COLORS.surfaceContainer,
  },
  inputShell: {
    flex: 1, minHeight: 46, maxHeight: 120, borderRadius: 23,
    borderWidth: 1, borderColor: COLORS.surfaceContainer,
    backgroundColor: COLORS.surfaceWarm,
  },
  input: {
    minHeight: 44, maxHeight: 118, paddingHorizontal: 16, paddingTop: 11,
    paddingBottom: 9, ...TYPO.body, color: COLORS.onSurface,
  },
  sendBtn: {
    width: 46, height: 46, borderRadius: 16, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.45 },

  jobCard: {
    alignSelf: 'stretch', marginTop: 10, borderRadius: 17, borderWidth: 1,
    backgroundColor: COLORS.surface, padding: 14, ...SHADOWS.small,
  },
  jobCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, marginBottom: 10,
  },
  jobCardBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  jobCardIconWrap: {
    width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  jobCardType: { ...TYPO.overline, color: COLORS.onSurfaceVariant, flexShrink: 1 },
  jobCardPrice: { ...TYPO.buttonSmall, color: COLORS.primaryDeep, flexShrink: 0 },
  jobCardTitle: { ...TYPO.h4, color: COLORS.onSurface, marginBottom: 8 },
  jobCardMetaRow: { gap: 7 },
  jobCardMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  jobCardMetaText: { ...TYPO.bodySmall, color: COLORS.onSurfaceVariant, flexShrink: 1 },
  jobCardRadar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 11, paddingHorizontal: 10, paddingVertical: 9, marginTop: 12,
  },
  radarDot: { width: 8, height: 8, borderRadius: 4 },
  jobCardRadarText: { ...TYPO.bodySmall, color: COLORS.primaryDeep, flexShrink: 1 },
  jobCardWarningCard: { backgroundColor: COLORS.warningBg },
  jobCardWarning: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.warningBg, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 9, marginTop: 10,
  },
  jobCardWarningIcon: { fontSize: 16, lineHeight: 20 },
  jobCardWarningBody: { flex: 1 },
  jobCardWarningTitle: { ...TYPO.bodySmall, color: COLORS.onSurface, marginBottom: 2 },
  jobCardWarningText: { ...TYPO.bodySmall, color: COLORS.onSurfaceVariant },
  jobCardPreview: { marginTop: 10, gap: 4 },
  jobCardPreviewRow: { ...TYPO.bodySmall, color: COLORS.onSurfaceVariant, flexShrink: 1 },
  jobCardCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: 12, paddingVertical: 12, marginTop: 12,
  },
  jobCardCtaText: { ...TYPO.buttonSmall, color: COLORS.surface },
});
