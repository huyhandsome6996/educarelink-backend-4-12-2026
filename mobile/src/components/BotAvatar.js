// ============================================================
// BotAvatar — Avatar AI chatbot dùng Ionicons (sync web Material Symbols 'smart_toy')
// Thay thế icon_ai_bot.png đã generate từ Gemini trước đây
// ============================================================

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../theme/colors';

export default function BotAvatar({ size = 32, bg = COLORS.primaryLight, color = COLORS.primary, withShadow = false }) {
  const containerSize = size;
  const iconSize = Math.round(size * 0.65);
  return (
    <View
      style={[
        {
          width: containerSize,
          height: containerSize,
          borderRadius: containerSize / 2,
          backgroundColor: bg,
          justifyContent: 'center',
          alignItems: 'center',
        },
        withShadow ? SHADOWS.small : null,
      ]}
    >
      <Ionicons name="sparkles" size={iconSize} color={color} />
    </View>
  );
}
