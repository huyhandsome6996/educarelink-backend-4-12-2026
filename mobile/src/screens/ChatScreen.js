// ====================================================================
// ChatScreen — N: Cửa sổ chat Parent ↔ CarePartner (còn hiệu lực)
// ====================================================================
// - DÙNG CHUNG cho cả parent lẫn worker (role không đổi logic chat —
//   API tự check ownership; currentUserId lấy từ /profile/ để phân
//   bong bóng trái/phải).
// - Navigation params: { taskId, taskTitle? }
// - Polling 4s KHI màn hình đang focus (useFocusEffect) — cleanup khi
//   rời màn hình/unmount (pattern dọn dẹp B5 RandomVerificationModal,
//   tránh leak timer).
// - Trạng thái cửa sổ: open (badge + "còn X giờ") / closed (read-only
//   banner + ẩn input — quyết định C của spec).
// - Tin nhắn render qua Text (React Native tự escape — không innerHTML
//   nên không cần escapeHtml như web).
// ====================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  StatusBar, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import apiClient from '../api/client';
import {
  getConversation, getMessages, sendMessage, markRead,
} from '../api/chat';
import { COLORS, SIZES, TYPO } from '../theme/colors';

const POLL_INTERVAL_MS = 4000;

export default function ChatScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { taskId, taskTitle } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [conversation, setConversation] = useState(null); // detail + window status
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  const pollRef = useRef(null);
  const lastMessageIdRef = useRef(null);
  const flatListRef = useRef(null);
  const listRef = useRef(null); // giữ messages mới nhất cho polling callback

  listRef.current = messages;

  // ── Load current user id (phân bong bóng) ─────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await apiClient.get('/profile/');
        if (mounted) setCurrentUserId(res.data?.id);
      } catch (e) { /* bong bóng mặc định bên trái */ }
    })();
    return () => { mounted = false; };
  }, []);

  // ── Refresh trạng thái cửa sổ + tin nhắn mới (polling) ────────────
  const refresh = useCallback(async () => {
    if (!taskId) return;
    try {
      const convRes = await getConversation(taskId);
      const conv = convRes.data;
      setConversation(conv);
      setError(null);

      const msgRes = await getMessages(taskId, lastMessageIdRef.current);
      const newMessages = msgRes.data?.messages || [];
      if (newMessages.length) {
        setMessages((prev) => [...prev, ...newMessages]);
        lastMessageIdRef.current =
          msgRes.data?.last_id ?? newMessages[newMessages.length - 1].id;
        // Đang mở màn hình chat = đã xem tin mới → mark read
        markRead(taskId).catch(() => {});
      }
    } catch (e) {
      const status = e?.response?.status;
      if (status === 404) {
        setError('Công việc này chưa có cuộc trò chuyện.');
      } else if (status !== 403) {
        // 403 = không phải bên trong hội thoại — hiển thị rõ
        setError(e?.response?.data?.error || 'Không tải được cuộc trò chuyện.');
      } else {
        setError(e?.response?.data?.error || 'Bạn không có quyền truy cập.');
      }
    }
  }, [taskId]);

  // ── Load lần đầu ──────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      await refresh();
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [refresh]);

  // ── Polling: chỉ chạy khi màn hình FOCUS — cleanup khi blur/unmount ──
  useFocusEffect(
    React.useCallback(() => {
      // Màn hình focus → start poll (bỏ qua khi đang load lần đầu)
      pollRef.current = setInterval(() => {
        refresh().catch(() => {});
      }, POLL_INTERVAL_MS);

      return () => {
        // Cleanup — pattern B5: KHÔNG để interval chạy khi rời màn hình
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }, [refresh])
  );

  // ── Gửi tin nhắn ──────────────────────────────────────────────────
  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await sendMessage(taskId, content);
      const msg = res.data;
      setMessages((prev) => [...prev, {
        id: msg.id,
        sender_id: msg.sender_id,
        sender_name: '',
        content: msg.content,
        created_at: msg.created_at,
        read_at: null,
      }]);
      lastMessageIdRef.current = Math.max(lastMessageIdRef.current || 0, msg.id);
      setInput('');
      setTimeout(() => flatListRef.current?.scrollToEnd?.({ animated: true }), 100);
    } catch (e) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.error;
      if (status === 403) {
        // Cửa sổ đóng (lazy-close phát hiện server-side) — refresh trạng thái
        Alert.alert('Đã khoá', msg || 'Cuộc trò chuyện đã hết hiệu lực.');
        refresh().catch(() => {});
      } else {
        Alert.alert('Không gửi được', msg || 'Vui lòng thử lại.');
      }
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }) => {
    const isMine = item.sender_id === currentUserId;
    return (
      <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowOther]}>
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
          <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
            {item.content}
          </Text>
          <Text style={[styles.timeText, isMine && styles.timeTextMine]}>
            {new Date(item.created_at).toLocaleTimeString('vi-VN', {
              hour: '2-digit', minute: '2-digit',
            })}
            {isMine && item.read_at ? ' ✓✓' : ''}
          </Text>
        </View>
      </View>
    );
  };

  // ── Trạng thái cửa sổ chat ────────────────────────────────────────
  const isOpen = conversation?.status === 'open';
  const hoursLeftLabel = useCallback(() => {
    if (!conversation?.closes_at) return 'trong suốt ca làm';
    const ms = new Date(conversation.closes_at) - new Date();
    if (ms <= 0) return 'đã hết hạn';
    const h = Math.floor(ms / 3600000);
    if (h >= 1) return `còn ~${h} giờ`;
    return `còn ~${Math.floor(ms / 60000)} phút`;
  }, [conversation]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Đang tải cuộc trò chuyện...</Text>
      </View>
    );
  }

  if (error && !conversation) {
    return (
      <View style={styles.centerContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
        <Ionicons name="chatbubble-ellipses-outline" size={56} color={COLORS.textMuted} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => { setError(null); refresh(); }}>
          <Text style={styles.retryBtnText}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const otherName = conversation?.other_party
    ? (conversation.other_party.first_name || conversation.other_party.last_name
        ? `${conversation.other_party.first_name || ''} ${conversation.other_party.last_name || ''}`.trim()
        : conversation.other_party.username)
    : 'Đối tác';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>{otherName}</Text>
          <Text style={styles.headerTask} numberOfLines={1}>
            {conversation?.task_title || taskTitle || ''}
          </Text>
        </View>
        {/* Badge trạng thái cửa sổ */}
        <View style={[styles.windowBadge, isOpen ? styles.windowBadgeOpen : styles.windowBadgeClosed]}>
          <Ionicons name={isOpen ? 'time' : 'lock-closed'} size={12} color="#fff" />
          <Text style={styles.windowBadgeText}>
            {isOpen ? hoursLeftLabel() : 'Đã khoá'}
          </Text>
        </View>
      </View>

      {/* Banner read-only khi đóng */}
      {!isOpen && (
        <View style={styles.readonlyBanner}>
          <Ionicons name="lock-closed" size={14} color="#fff" />
          <Text style={styles.readonlyBannerText}>
            Cuộc trò chuyện đã hết hiệu lực — chỉ xem lại lịch sử
          </Text>
        </View>
      )}

      {/* Danh sách tin nhắn */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderMessage}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => {
          if (messages.length) flatListRef.current?.scrollToEnd?.({ animated: false });
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="chatbubbles-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Chưa có tin nhắn nào.</Text>
            <Text style={styles.emptySubText}>Hãy gửi lời chào đầu tiên!</Text>
          </View>
        }
      />

      {/* Composer — ẩn khi cửa sổ đóng */}
      {isOpen ? (
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Nhập tin nhắn..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            maxLength={2000}
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || sending) && { opacity: 0.4 }]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Gửi tin nhắn"
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="send" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm || '#FAF7F2' },
  centerContainer: {
    flex: 1, backgroundColor: COLORS.surfaceWarm || '#FAF7F2',
    alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12,
  },
  loadingText: { ...TYPO.body, color: COLORS.onSurfaceVariant },
  errorText: { ...TYPO.body, color: COLORS.error || '#DC2626', textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 24, paddingVertical: 10,
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusSm || 10,
  },
  retryBtnText: { color: '#fff', fontWeight: '700' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.primary, paddingTop: 50, paddingBottom: 10,
    paddingHorizontal: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerInfo: { flex: 1, minWidth: 0 },
  headerName: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerTask: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 1 },
  windowBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  windowBadgeOpen: { backgroundColor: 'rgba(16,185,129,0.9)' },
  windowBadgeClosed: { backgroundColor: 'rgba(107,114,128,0.9)' },
  windowBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  readonlyBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#374151', paddingVertical: 8, paddingHorizontal: 12,
  },
  readonlyBannerText: { color: '#fff', fontSize: 11, fontWeight: '600', textAlign: 'center' },

  listContent: { padding: 14, paddingBottom: 20 },
  msgRow: { flexDirection: 'row', marginBottom: 10 },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9,
  },
  bubbleMine: { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, lineHeight: 20, color: '#1F2937' },
  bubbleTextMine: { color: '#fff' },
  timeText: { fontSize: 10, color: '#9CA3AF', marginTop: 3, alignSelf: 'flex-end' },
  timeTextMine: { color: 'rgba(255,255,255,0.75)' },

  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { ...TYPO.body, color: COLORS.onSurfaceVariant },
  emptySubText: { fontSize: 12, color: COLORS.textMuted },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 10, backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  input: {
    flex: 1, minHeight: 42, maxHeight: 110, borderRadius: 21,
    backgroundColor: '#F3F4F6', paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: '#1F2937', paddingTop: 12,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
});
