import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  StatusBar, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sendChatMessage } from '../api/tasks';

const INITIAL_MESSAGES = [
  {
    id: 'welcome',
    role: 'assistant',
    text: '👋 Xin chào! Tôi là trợ lý AI của Educarelink.\n\nBạn có thể nói với tôi như:\n• "Tôi cần tìm gia sư Toán lớp 5 vào tối thứ 3 ở Quận 1"\n• "Cần người đón bé lúc 11h sáng"\n\nTôi sẽ giúp bạn tạo công việc nhanh chóng! 🚀',
  },
];

export default function ChatbotScreen() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef(null);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;

    const userMsg = { id: Date.now().toString(), role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const res = await sendChatMessage(text);
      const botMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: res.data.response || 'AI đang được tích hợp. Vui lòng thử lại sau!',
      };
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
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, isTyping]);

  const renderMessage = ({ item }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowBot]}>
        {!isUser && (
          <View style={styles.botAvatar}>
            <Text style={styles.botAvatarText}>🤖</Text>
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

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={88}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <View style={styles.header}>
        <View style={styles.botInfo}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>🤖</Text>
          </View>
          <View>
            <Text style={styles.headerName}>AI Trợ lý Educarelink</Text>
            <Text style={styles.headerStatus}>● Đang hoạt động</Text>
          </View>
        </View>
      </View>

      <FlatList ref={flatListRef} data={messages} keyExtractor={i => i.id}
        renderItem={renderMessage} contentContainerStyle={styles.list}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListFooterComponent={isTyping ? (
          <View style={styles.typingRow}>
            <View style={styles.botAvatar}>
              <Text style={styles.botAvatarText}>🤖</Text>
            </View>
            <View style={styles.typingBubble}>
              <ActivityIndicator size="small" color="#6b7280" />
              <Text style={styles.typingText}>AI đang suy nghĩ...</Text>
            </View>
          </View>
        ) : null}
      />

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput style={styles.input} placeholder="Nhắn tin cho AI..." placeholderTextColor="#9ca3af"
          value={input} onChangeText={setInput} multiline maxLength={500}
          onSubmitEditing={sendMessage} />
        <TouchableOpacity style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
          onPress={sendMessage} disabled={!input.trim() || isTyping}>
          <Ionicons name="send" size={18} color={input.trim() ? '#fff' : '#9ca3af'} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  botInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },
  headerAvatarText: { fontSize: 22 },
  headerName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  headerStatus: { fontSize: 12, color: '#059669', fontWeight: '600' },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  msgRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowBot: { justifyContent: 'flex-start' },
  botAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  botAvatarText: { fontSize: 16 },
  bubble: { maxWidth: '78%', borderRadius: 18, padding: 12 },
  bubbleUser: { backgroundColor: '#0051d5', borderBottomRightRadius: 4 },
  bubbleBot: { backgroundColor: '#fff', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },
  bubbleTextBot: { color: '#111827' },
  typingRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  typingBubble: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, padding: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  typingText: { fontSize: 13, color: '#6b7280', fontStyle: 'italic' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 28, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  input: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#111827', maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#0051d5', justifyContent: 'center', alignItems: 'center', shadowColor: '#0051d5', shadowOpacity: 0.3, shadowRadius: 8, elevation: 3 },
  sendBtnDisabled: { backgroundColor: '#e5e7eb', shadowOpacity: 0 },
});
