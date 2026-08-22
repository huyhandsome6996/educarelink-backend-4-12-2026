// B4 — Badge hạng CarePartner dùng lại trên nhiều màn
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveTier } from '../utils/carePartnerTier';
import { COLORS, TYPO, SIZES } from '../theme/colors';

/**
 * @param {object} props
 * @param {object} [props.user] - user / profile object có tier | tier_label
 * @param {'light'|'dark'} [props.variant] - light = chữ trắng (header cam), dark = badge màu theo hạng
 */
export default function CarePartnerTierBadge({ user, variant = 'dark', style }) {
  const tier = resolveTier(user || {});
  const isLight = variant === 'light';

  return (
    <View
      style={[
        styles.badge,
        isLight
          ? styles.badgeLight
          : { backgroundColor: tier.bg, borderColor: tier.color },
        style,
      ]}
    >
      <Ionicons
        name={tier.icon || 'medal-outline'}
        size={14}
        color={isLight ? '#fff' : tier.color}
      />
      <Text style={[styles.text, { color: isLight ? '#fff' : tier.color }]}>
        {tier.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: SIZES?.radiusXl || 999,
    borderWidth: 1,
    alignSelf: 'center',
  },
  badgeLight: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderColor: 'rgba(255,255,255,0.35)',
  },
  text: {
    ...(TYPO?.caption || { fontSize: 12 }),
    fontWeight: '700',
  },
});
