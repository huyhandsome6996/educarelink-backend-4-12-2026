import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  StatusBar, ActivityIndicator, KeyboardAvoidingView, Platform, Animated, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { sendChatMessage } from '../api/tasks';
import { publishJob } from '../api/matching';
import { COLORS, SHADOWS, SIZES, TYPO } from '../theme/colors';
import FormattedText from '../components/FormattedText';
import ChatLocationPicker from '../components/ChatLocationPicker';

const INITIAL_MESSAGES = [
  {
    id: 'welcome',
    role: 'assistant',
    text: '👋 Xin chào! Tôi là trợ lý AI của Educarelink.\n\nBạn chỉ cần kể việc cần đăng, ví dụ:\n• "Tôi cần gia sư Toán lớp 5 tối thứ 3 ở Quận 1"\n• "Cần người trông bé 2 tuổi sáng mai"\n• "Đón bé ở trường Lê Lợi về nhà lúc 11h"\n\nTôi sẽ tạo BẢN NHÁP, đếm thử số CarePartner phù hợp — bạn duyệt xong mới đăng nhé! 🚀',
  },
];

const JOB_TYPE_META = {
  tutoring: { name: 'Gia sư', icon: 'school' },
  childcare: { name: 'Trông trẻ', icon: 'heart' },
  pickup: { name: 'Đón trẻ', icon: 'car' },
};

// Pattern an toàn useSafeAreaInsets đã chuẩn hoá (MapPickerModal.js / MyJobsScreen)
function useSafeInsets() {
  let insets = { top: 12, bottom: 20, left: 0, right: 0 };
  try {
    const safeInsets = useSafeAreaInsets();
    if (safeInsets) insets = safeInsets;
  } catch {}
  return insets;
}

export default function ChatbotScreen() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef(null);
  const inputRef = useRef(null);
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;

  const chatHistoryRef = useRef([]);
  // ===== FLOW 1/2 — trạng thái draft trong phiên chat =====
  const draftJobIdRef = useRef(null);      // id bản nháp đang giữ (idempotent)
  const pickedCoordsRef = useRef(null);    // toạ độ đã chọn trên bản đồ
  const pendingPayloadRef = useRef(null);  // payload chờ xác nhận vị trí
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  const insets = useSafeInsets();
  const navigation = useNavigation();

  // Brief 4.3: huỷ request khi unmount — tránh setState sau khi thoát màn hình
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef(null);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort?.();
    };
  }, []);

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

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd?.({ animated: true }), 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // ===== ĐĂNG BẢN NHÁP → sang màn chọn CarePartner (brief 2.2) =====
  const handlePublishDraft = async (jobDraft, msgId) => {
    if (!jobDraft?.id) return;
    setMessages(prev => prev.map(m => (
      m.id === msgId ? { ...m, publishing: true } : m
    )));
    try {
      const res = await publishJob(jobDraft.id);
      const pub = res.data || {};
      if (pub.code === 'ai_failed') {
        Alert.alert('Thông báo', 'Bài đã đăng nhưng AI phân tích chưa xong. Thử lại sau ít phút nhé.');
        if (isMountedRef.current) {
          setMessages(prev => prev.map(m => (
            m.id === msgId ? { ...m, publishing: false } : m
          )));
        }
        return;
      }
      draftJobIdRef.current = null;
      if (isMountedRef.current) {
        setMessages(prev => prev.map(m => (
          m.id === msgId ? { ...m, published: true, publishing: false } : m
        )));
      }
      // Điều hướng sang danh sách ứng viên (radar matching thật)
      navigation.navigate('CandidatesList', { jobId: jobDraft.id, job: jobDraft });
    } catch (e) {
      const detail = e?.response?.data?.detail || 'Không đăng được bài. Bạn thử lại nhé.';
      Alert.alert('Lỗi', detail);
      if (isMountedRef.current) {
        setMessages(prev => prev.map(m => (
          m.id === msgId ? { ...m, publishing: false } : m
        )));
      }
    }
  };

  const handleEditDraft = () => {
    // Giữ nguyên draft — nhắn thông tin sửa, backend cập nhật đúng bản nháp
    setInput('Mình muốn sửa: ');
    setTimeout(() => inputRef.current?.focus?.(), 100);
  };

  const handleLocationPicked = ({ latitude, longitude, label }) => {
    setShowLocationPicker(false);
    pickedCoordsRef.current = { latitude, longitude };
    // Tự gửi tin xác nhận để hoàn tất bản nháp (kèm pending payload nếu có)
    sendMessage('Tôi đã xác nhận vị trí trên bản đồ.', { latitude, longitude });
  };

  const sendMessage = async (textArg, coordsOverride) => {
    const text = (textArg || input).trim();
    if (!text || isTyping) return;

    const userMsg = { id: `u${Date.now()}`, role: 'user', text };
    if (isMountedRef.current) setMessages(prev => [...prev, userMsg]);
    if (!textArg) setInput('');
    if (isMountedRef.current) setIsTyping(true);

    chatHistoryRef.current.push({ role: 'user', text });

    // Huỷ request cũ nếu còn (user nhắn liên tiếp / thoát màn hình)
    abortControllerRef.current?.abort?.();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const historyForAPI = chatHistoryRef.current.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        text: m.text,
      }));

      const coords = coordsOverride || pickedCoordsRef.current;
      const res = await sendChatMessage(text, historyForAPI, {
        draftJobId: draftJobIdRef.current,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        pendingJobPayload: pendingPayloadRef.current,
      }, { signal: controller.signal });

      if (!isMountedRef.current) return;

      const data = res.data || {};
      const botText = data.response || 'AI không trả lời được, bạn thử lại nhé!';
      const botMsg = { id: `b${Date.now()}`, role: 'assistant', text: botText };

      // ===== FLOW 1/2 — xử lý theo type =====
      if (data.type === 'location_confirm' && data.pending_job_payload) {
        pendingPayloadRef.current = data.pending_job_payload;
        if (isMountedRef.current) {
          setMessages(prev => [...prev, botMsg, {
            id: `loc${Date.now()}`,
            role: 'location_card',
          }]);
        }
      } else if (data.job_draft) {
        draftJobIdRef.current = data.job_draft.id;
        pendingPayloadRef.current = null;
        pickedCoordsRef.current = {
          latitude: data.job_draft.latitude,
          longitude: data.job_draft.longitude,
        };
        if (isMountedRef.current) {
          setMessages(prev => [...prev, botMsg, {
            id: `draft${Date.now()}`,
            role: 'job_draft_card',
            jobDraft: data.job_draft,
          }]);
        }
      } else {
        if (isMountedRef.current) setMessages(prev => [...prev, botMsg]);
      }

      chatHistoryRef.current.push({ role: 'assistant', text: botText });
      if (chatHistoryRef.current.length > 20) {
        chatHistoryRef.current = chatHistoryRef.current.slice(-20);
      }
    } catch (e) {
      if (!isMountedRef.current) return;
      if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return; // đã unmount
      if (isMountedRef.current) {
        setMessages(prev => [...prev, {
          id: `b${Date.now()}`,
          role: 'assistant',
          text: '❌ Lỗi kết nối. Vui lòng kiểm tra lại kết nối mạng.',
        }]);
      }
    } finally {
      if (isMountedRef.current) setIsTyping(false);
    }
  };

  // ===== CARD BẢN NHÁP (2 nút theo brief 2.2) =====
  const renderDraftCard = (item) => {
    const job = item.jobDraft || {};
    const meta = JOB_TYPE_META[job.job_type] || JOB_TYPE_META.tutoring;
    const matched = job.preview_matched;
    return (
      <View style={styles.draftCard}>
        <View style={styles.draftCardHeader}>
          <View style={styles.draftCardBadge}>
            <Ionicons name={meta.icon} size={13} color={COLORS.primary} />
            <Text style={styles.draftCardBadgeText}>{meta.name}</Text>
          </View>
          <Text style={styles.draftCardRate}>
            {parseInt(job.hourly_rate_vnd || 0).toLocaleString('vi-VN')}đ/giờ
          </Text>
        </View>

        <Text style={styles.draftCardTitle}>{job.title || 'Bản nháp công việc'}</Text>

        <View style={styles.draftCardTags}>
          <View style={[styles.tagChip, styles.tagDraft]}>
            <Text style={[styles.tagChipText, styles.tagDraftText]}>
              {job.published ? 'ĐÃ ĐĂNG' : 'BẢN NHÁP — CHƯA ĐĂNG'}
            </Text>
          </View>
          {matched !== undefined && matched !== null && (
            <View style={[styles.tagChip, matched > 0 ? styles.tagOk : styles.tagWarn]}>
              <Ionicons name="radar" size={11} color={matched > 0 ? '#15803D' : '#B45309'} />
              <Text style={[styles.tagChipText, matched > 0 ? styles.tagOkText : styles.tagWarnText]}>
                {matched > 0 ? `Ước tính ${matched} CP phù hợp` : 'Chưa có CP khớp ngay'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.draftCardMeta}>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={13} color={COLORS.textSecondary} />
            <Text style={styles.metaText} numberOfLines={1}>{job.schedule || 'Chưa rõ lịch'}</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={COLORS.textSecondary} />
            <Text style={styles.metaText} numberOfLines={1}>
              {job.location_display || 'Đã chọn trên bản đồ'}
            </Text>
          </View>
        </View>

        {job.zero_match_hint ? (
          <View style={styles.zeroHint}>
            <Text style={styles.zeroHintText}>{job.zero_match_hint}</Text>
          </View>
        ) : null}

        {item.published ? (
          <View style={[styles.publishBtn, styles.publishBtnDone]}>
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Text style={styles.publishBtnText}>Đã đăng — đang xem ứng viên</Text>
          </View>
        ) : (
          <View style={styles.draftCardActions}>
            <TouchableOpacity
              style={[styles.publishBtn, item.publishing && { opacity: 0.5 }]}
              disabled={item.publishing}
              onPress={() => handlePublishDraft(job, item.id)}
              activeOpacity={0.85}
            >
              {item.publishing
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="radar" size={16} color="#fff" />}
              <Text style={styles.publishBtnText}>Xem & Chọn CarePartner Ngay</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={handleEditDraft}
              activeOpacity={0.85}
            >
              <Ionicons name="create-outline" size={16} color={COLORS.textPrimary} />
              <Text style={styles.editBtnText}>Chỉnh sửa thông tin</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // ===== CARD XÁC NHẬN VỊ TRÍ TRÊN BẢN ĐỒ (brief 2.4) =====
  const renderLocationCard = () => (
    <View style={styles.draftCard}>
      <Text style={styles.draftCardTitle}>Xác nhận vị trí làm việc</Text>
      <Text style={styles.locCardDesc}>
        Mình chưa tìm thấy địa chỉ chính xác. Bạn chọn vị trí trên bản đồ — bản nháp
        sẽ được hoàn tất ngay sau đó.
      </Text>
      <TouchableOpacity
        style={styles.publishBtn}
        onPress={() => setShowLocationPicker(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="map" size={16} color="#fff" />
        <Text style={styles.publishBtnText}>Xác nhận vị trí trên bản đồ</Text>
      </TouchableOpacity>
    </View>
  );

  const renderMessage = ({ item }) => {
    if (item.role === 'job_draft_card') return renderDraftCard(item);
    if (item.role === 'location_card') return renderLocationCard(item);

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
          <Text style={styles.typingText}>Đang suy nghĩ...</Text>
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
      <View style={[styles.header, { paddingTop: 12 + (insets.top > 30 ? 0 : 0) }]}>
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
          if (listData.length) flatListRef.current?.scrollToEnd?.({ animated: false });
        }}
      />

      {/* Input bar */}
      <View style={[styles.composer, { paddingBottom: 10 + insets.bottom * 0.3 }]}>
        <TextInput
          ref={inputRef}
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

      {/* Modal chọn vị trí trên bản đồ */}
      <ChatLocationPicker
        visible={showLocationPicker}
        onPick={handleLocationPicked}
        onClose={() => setShowLocationPicker(false)}
      />
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

  // Typing — trạng thái "Đang suy nghĩ..." rõ ràng (brief 4.3)
  typingBubble: {
    flexDirection: 'row', gap: 5, alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 18, padding: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primarySoft },
  typingText: { ...TYPO.bodySmall, color: COLORS.textSecondary, fontStyle: 'italic', marginLeft: 4 },

  // ===== CARD BẢN NHÁP (Flow 1/2) =====
  draftCard: {
    width: '94%', alignSelf: 'flex-start', marginLeft: 40,
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusLg || 18,
    borderWidth: 1, borderColor: COLORS.border, padding: 14,
    marginBottom: 10, ...SHADOWS.small,
  },
  draftCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  draftCardBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primaryLight, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
  },
  draftCardBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  draftCardRate: { ...TYPO.h5, color: COLORS.primary, fontWeight: '800' },
  draftCardTitle: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700', marginBottom: 8 },
  draftCardTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  tagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1,
  },
  tagChipText: { fontSize: 10.5, fontWeight: '700' },
  tagDraft: { backgroundColor: '#F3F4F6', borderColor: COLORS.border },
  tagDraftText: { color: COLORS.textSecondary },
  tagOk: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  tagOkText: { color: '#15803D' },
  tagWarn: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  tagWarnText: { color: '#B45309' },
  draftCardMeta: { gap: 4, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: COLORS.textSecondary, flex: 1 },
  zeroHint: {
    backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1,
    borderRadius: 12, padding: 8, marginBottom: 8,
  },
  zeroHintText: { fontSize: 11.5, color: '#B45309', lineHeight: 16 },
  draftCardActions: { gap: 8 },
  publishBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 11,
  },
  publishBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  publishBtnDone: { backgroundColor: COLORS.success },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.surface, borderRadius: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: COLORS.border,
  },
  editBtnText: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '700' },
  locCardDesc: { fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 18, marginBottom: 10 },

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
