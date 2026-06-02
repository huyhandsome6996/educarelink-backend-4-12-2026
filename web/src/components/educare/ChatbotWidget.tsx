'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare,
  Send,
  X,
  Sparkles,
  Loader2,
  Bot,
  User,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { useAppStore, apiFetch } from '@/lib/store'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  type?: 'message' | 'task_created' | 'clarification' | 'error' | 'info'
  task?: {
    id: number
    title: string
    price: string
    location: string
  }
}

export function ChatbotWidget() {
  const { chatOpen, toggleChat, isAuthenticated, user } = useAppStore()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (chatOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [chatOpen])

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const data = await apiFetch<{
        response: string
        type: string
        task?: { id: number; title: string; price: string; location: string }
      }>('/chatbot/', {
        method: 'POST',
        body: JSON.stringify({ message: userMessage.content }),
      })

      const assistantMessage: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: data.response || 'Xin lỗi, tôi không thể xử lý yêu cầu này.',
        type: data.type as ChatMessage['type'],
        task: data.task,
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (err: unknown) {
      const errorMessage: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Lỗi kết nối. Vui lòng thử lại.',
        type: 'error',
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Floating button when closed
  if (!chatOpen) {
    return (
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={toggleChat}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center cursor-pointer"
        style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
      >
        <MessageSquare className="w-6 h-6 text-white" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
          <Sparkles className="w-2.5 h-2.5 text-white" />
        </span>
      </motion.button>
    )
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] shadow-2xl rounded-2xl overflow-hidden"
        style={{ background: '#fffbf7', border: '1px solid #fed7aa' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Trợ lý AI</p>
              <p className="text-[10px] text-orange-200">Hỗ trợ đăng việc nhanh chóng</p>
            </div>
          </div>
          <button
            onClick={toggleChat}
            className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Messages */}
        <div className="h-80 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-3">
                <Sparkles className="w-6 h-6 text-orange-500" />
              </div>
              <p className="text-sm font-semibold text-gray-700">Xin chào! 👋</p>
              <p className="text-xs text-gray-500 mt-1 max-w-[250px] mx-auto">
                Tôi có thể giúp bạn đăng việc chỉ bằng cách chat. Thử nói &ldquo;Tôi cần gia sư Toán cho bé lớp 3&rdquo;!
              </p>
              <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                {[
                  'Tìm gia sư Toán',
                  'Cần người đón trẻ',
                  'Dọn dẹp nhà cửa',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion)
                    }}
                    className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100 transition-colors cursor-pointer"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-orange-500" />
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-orange-500 text-white rounded-br-sm'
                    : msg.type === 'error'
                      ? 'bg-red-50 text-red-700 border border-red-200 rounded-bl-sm'
                      : msg.type === 'task_created'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-bl-sm'
                        : 'bg-white text-gray-700 border border-orange-100 rounded-bl-sm'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.task && (
                  <div className="mt-2 p-2 rounded-lg bg-emerald-100/50 border border-emerald-200 text-[10px]">
                    <p className="font-semibold text-emerald-700">📋 {msg.task.title}</p>
                    <p className="text-emerald-600">💰 {msg.task.price} VNĐ • 📍 {msg.task.location}</p>
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-white" />
                </div>
              )}
            </motion.div>
          ))}

          {loading && (
            <div className="flex gap-2 justify-start">
              <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-orange-500" />
              </div>
              <div className="bg-white border border-orange-100 rounded-2xl rounded-bl-sm px-3.5 py-2.5">
                <div className="flex gap-1">
                  <motion.div
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                    className="w-1.5 h-1.5 rounded-full bg-orange-400"
                  />
                  <motion.div
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: 0.15 }}
                    className="w-1.5 h-1.5 rounded-full bg-orange-400"
                  />
                  <motion.div
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }}
                    className="w-1.5 h-1.5 rounded-full bg-orange-400"
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-orange-100 bg-white/50">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập tin nhắn..."
              disabled={loading}
              className="flex-1 h-9 border-orange-200 focus-visible:border-orange-400 focus-visible:ring-orange-400/20 bg-white text-sm"
            />
            <Button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="h-9 w-9 p-0 text-white cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
