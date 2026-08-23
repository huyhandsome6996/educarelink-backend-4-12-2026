/**
 * B4 — Patch renderCandidates to show CarePartner tier badge.
 * Loaded after browse_candidates page script defines renderCandidates.
 */
(function () {
  function apply() {
    if (typeof window.renderCandidates !== 'function') return false;
    if (window.__b4TierPatched) return true;
    window.__b4TierPatched = true;

    var original = window.renderCandidates;
    window.renderCandidates = function (candidates) {
      original(candidates);
      if (!candidates || !candidates.length) return;
      var escapeHtml = typeof window.escapeHtml === 'function'
        ? window.escapeHtml
        : function (v) {
            return String(v == null ? '' : v)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');
          };
      var getTier = (window.EduCareTierB4 && window.EduCareTierB4.getTierConfig)
        ? window.EduCareTierB4.getTierConfig
        : function (c) {
            var code = ((c && (c.worker_tier || c.tier)) || 'bronze').toString().toLowerCase();
            var labels = { bronze: 'Hạng Đồng', silver: 'Hạng Bạc', gold: 'Hạng Vàng', diamond: 'Hạng Kim cương' };
            return {
              label: (c && (c.worker_tier_label || c.tier_label)) || labels[code] || labels.bronze,
              color: code === 'gold' ? 'bg-yellow-50 text-yellow-700 border-yellow-300'
                : code === 'diamond' ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
                : code === 'silver' ? 'bg-stone-100 text-stone-600 border-stone-200'
                : 'bg-amber-50 text-amber-800 border-amber-200',
              icon: code === 'gold' ? 'star' : code === 'diamond' ? 'diamond' : 'workspace_premium'
            };
          };

      var cards = document.querySelectorAll('#candidates-list article.candidate-card');
      cards.forEach(function (card, idx) {
        if (card.querySelector('[data-b4-tier]')) return;
        var c = candidates[idx];
        if (!c) return;
        var info = card.querySelector('.flex-1.min-w-0');
        if (!info) return;
        var tier = getTier(c);
        var el = document.createElement('div');
        el.setAttribute('data-b4-tier', '1');
        el.className = 'inline-flex items-center gap-1 ' + tier.color +
          ' px-2 py-0.5 rounded-full text-[10px] font-bold mt-1.5 border';
        el.innerHTML =
          '<span class="material-symbols-outlined text-[12px] filled">' + tier.icon + '</span>' +
          escapeHtml(tier.label);
        info.appendChild(el);
      });
    };
    return true;
  }

  if (!apply()) {
    var n = 0;
    var t = setInterval(function () {
      n += 1;
      if (apply() || n > 40) clearInterval(t);
    }, 100);
  }
})();
