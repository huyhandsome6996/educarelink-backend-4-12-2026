// B4 — Hạng CarePartner (Đồng / Bạc / Vàng / Kim cương)
// Map code backend → label + màu badge UI

import { COLORS } from '../theme/colors';

export const TIER_META = {
  bronze: {
    code: 'bronze',
    label: 'Hạng Đồng',
    color: COLORS.tierBronze || '#8B5A2B',
    bg: COLORS.tierBronzeBg || '#F5E6D3',
    icon: 'medal-outline',
  },
  silver: {
    code: 'silver',
    label: 'Hạng Bạc',
    color: COLORS.tierSilver || '#7d6a5d',
    bg: COLORS.tierSilverBg || '#f0e6df',
    icon: 'medal-outline',
  },
  gold: {
    code: 'gold',
    label: 'Hạng Vàng',
    color: COLORS.tierGold || '#a67c00',
    bg: COLORS.tierGoldBg || '#fff4d6',
    icon: 'star',
  },
  diamond: {
    code: 'diamond',
    label: 'Hạng Kim cương',
    color: COLORS.tierDiamond || '#0E7490',
    bg: COLORS.tierDiamondBg || '#E0F7FA',
    icon: 'diamond-outline',
  },
};

/** Resolve tier meta from API fields (worker_tier / tier / tier_label). */
export function resolveTier(source = {}) {
  const code = (
    source.worker_tier ||
    source.tier ||
    source.workerTier ||
    'bronze'
  )
    .toString()
    .toLowerCase()
    .trim();

  const base = TIER_META[code] || TIER_META.bronze;
  const label =
    source.worker_tier_label ||
    source.tier_label ||
    source.tierLabel ||
    base.label;

  return { ...base, label, code: base.code };
}
