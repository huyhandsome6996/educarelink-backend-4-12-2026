// B4 — Badge hạng CarePartner dùng lại trên nhiều màn
// (CandidatesScreen card, CandidateProfileScreen, Worker profile...)
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveTier } from '../utils/carePartnerTier';
import { COLORS, TYPO, SIZES } from '../theme/colors';

/**
 * @param {object} props
 * @param {object} [props.user] - user / profile / candidate object
 *   có tier | worker_tier (+ tier_label | worker_tier_label)
 * @param {'light'|'dark'} [props.variant] - light = chữ trắng (header cam), dark = badge màu theo hạng
 * @param {'sm'|'md'} [props.size] - sm = trong card danh sách, md = trong profile header
 */
export default function CarePartnerTierBadge({ user, variant = 'dark', size = 'md', style }) {
  const tier = resolveTier(user || {});
  const isLight = variant === 'light';
  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        isSmall && styles.badgeSm,
        isLight
          ? styles.badgeLight
          : { backgroundColor: tier.bg, borderColor: tier.color },
        style,
      ]}
    >
      <Ionicons
        name={tier.icon || 'medal-outline'}
        size={isSmall ? 11 : 14}
        color={isLight ? '#fff' : tier.color}
      />
      <Text style={[styles.text, isSmall && styles.textSm, { color: isLight ? '#fff' : tier.color }]}>
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
  // Bản nhỏ dùng trong card danh sách ứng viên — gọn hơn để không đẩy layout
  badgeSm: {
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  badgeLight: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderColor: 'rgba(255,255,255,0.35)',
  },
  text: {
    ...(TYPO?.caption || { fontSize: 12 }),
    fontWeight: '700',
  },
  textSm: {
    fontSize: 10,
  },
});
