/**
 * B4 — Hiện badge Hạng Đồng/Bạc/Vàng/Kim cương trên worker_profile.html
 * Patch sau khi renderProfile chạy (hồ sơ của mình + xem hồ sơ người khác).
 */
(function () {
  function tierConfig(source) {
    var s = source || {};
    var code = (s.tier || s.worker_tier || 'bronze').toString().toLowerCase().trim();
    var labels = {
      bronze: 'Hạng Đồng',
      silver: 'Hạng Bạc',
      gold: 'Hạng Vàng',
      diamond: 'Hạng Kim cương'
    };
    var styles = {
      bronze:  { color: 'bg-amber-50 text-amber-800 border-amber-200', icon: 'workspace_premium' },
      silver:  { color: 'bg-stone-100 text-stone-600 border-stone-200', icon: 'workspace_premium' },
      gold:    { color: 'bg-yellow-50 text-yellow-700 border-yellow-300', icon: 'star' },
      diamond: { color: 'bg-cyan-50 text-cyan-700 border-cyan-200', icon: 'diamond' }
    };
    var base = styles[code] || styles.bronze;
    return {
      code: code,
      label: s.tier_label || s.worker_tier_label || labels[code] || labels.bronze,
      color: base.color,
      icon: base.icon
    };
  }

  function injectTierBadge(profile, ratingDetail) {
    var existing = document.getElementById('b4-tier-badge');
    if (existing) existing.remove();

    var source = Object.assign({}, ratingDetail || {}, profile || {});
    // Ưu tiên field trên profile (own profile từ /api/profile/)
    if (profile && (profile.tier || profile.tier_label)) {
      source = profile;
    }
    var tier = tierConfig(source);

    var el = document.createElement('div');
    el.id = 'b4-tier-badge';
    el.className =
      'inline-flex items-center gap-1.5 ' +
      tier.color +
      ' px-4 py-1.5 rounded-full text-xs font-bold mb-3 border';
    el.innerHTML =
      '<span class="material-symbols-outlined text-sm filled" style="font-variation-settings: \'FILL\' 1;">' +
      tier.icon +
      '</span> ' +
      tier.label;

    var verifyStatus = document.getElementById('verify-status');
    if (verifyStatus && verifyStatus.parentNode) {
      verifyStatus.parentNode.insertBefore(el, verifyStatus.nextSibling);
    }
  }

  function applyPatch() {
    if (typeof window.renderProfile !== 'function') return false;
    if (window.__b4WorkerTierPatched) return true;
    window.__b4WorkerTierPatched = true;

    var original = window.renderProfile;
    window.renderProfile = function (profile, jobs, ratingDetail, isViewingOther) {
      // Khi xem worker khác, copy tier từ ratingDetail vào profile nếu thiếu
      if (profile && ratingDetail) {
        if (!profile.tier && ratingDetail.tier) profile.tier = ratingDetail.tier;
        if (!profile.tier_label && ratingDetail.tier_label) profile.tier_label = ratingDetail.tier_label;
      }
      original(profile, jobs, ratingDetail, isViewingOther);
      try {
        injectTierBadge(profile, ratingDetail);
      } catch (e) {
        console.warn('B4 tier badge inject failed', e);
      }
    };
    return true;
  }

  if (!applyPatch()) {
    var n = 0;
    var t = setInterval(function () {
      n += 1;
      if (applyPatch() || n > 50) clearInterval(t);
    }, 100);
  }
})();
