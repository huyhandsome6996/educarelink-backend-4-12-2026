/** B4 — Hạng CarePartner helpers for web frontend */
(function (global) {
  function getTierConfig(c) {
    var code = ((c && (c.worker_tier || c.tier)) || 'bronze').toString().toLowerCase().trim();
    var map = {
      bronze:  { label: 'Hạng Đồng',      color: 'bg-amber-50 text-amber-800 border-amber-200', icon: 'workspace_premium' },
      silver:  { label: 'Hạng Bạc',       color: 'bg-stone-100 text-stone-600 border-stone-200', icon: 'workspace_premium' },
      gold:    { label: 'Hạng Vàng',      color: 'bg-yellow-50 text-yellow-700 border-yellow-300', icon: 'star' },
      diamond: { label: 'Hạng Kim cương', color: 'bg-cyan-50 text-cyan-700 border-cyan-200', icon: 'diamond' }
    };
    var base = map[code] || map.bronze;
    var label = (c && (c.worker_tier_label || c.tier_label)) || base.label;
    return { label: label, color: base.color, icon: base.icon, code: code };
  }

  function tierBadgeHtml(c, escapeHtml) {
    var tier = getTierConfig(c);
    var esc = typeof escapeHtml === 'function' ? escapeHtml : function (v) { return String(v || ''); };
    return '<div class="inline-flex items-center gap-1 ' + tier.color +
      ' px-2 py-0.5 rounded-full text-[10px] font-bold mt-1.5 border">' +
      '<span class="material-symbols-outlined text-[12px] filled">' + tier.icon + '</span>' +
      esc(tier.label) +
      '</div>';
  }

  global.EduCareTierB4 = { getTierConfig: getTierConfig, tierBadgeHtml: tierBadgeHtml };
})(typeof window !== 'undefined' ? window : this);
