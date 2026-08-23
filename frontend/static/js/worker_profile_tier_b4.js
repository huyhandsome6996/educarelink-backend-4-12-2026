/**
 * B4 — Badge Hạng Đồng/Bạc/Vàng/Kim cương trên worker_profile.html
 * - Patch renderProfile (nếu còn chưa gọi)
 * - MutationObserver: khi #verify-status có nội dung thì inject badge
 * - Fallback: đọc tier từ /api/profile/ nếu DOM đã render xong
 */
(function () {
  'use strict';

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

  function injectTierBadge(source) {
    var verifyStatus = document.getElementById('verify-status');
    if (!verifyStatus || !verifyStatus.parentNode) return false;

    var existing = document.getElementById('b4-tier-badge');
    if (existing) existing.remove();

    var tier = tierConfig(source || {});
    var el = document.createElement('div');
    el.id = 'b4-tier-badge';
    el.setAttribute('data-tier', tier.code);
    el.className =
      'inline-flex items-center gap-1.5 ' +
      tier.color +
      ' px-4 py-1.5 rounded-full text-xs font-bold mb-3 border';
    el.innerHTML =
      '<span class="material-symbols-outlined text-sm filled" style="font-variation-settings: \'FILL\' 1;">' +
      tier.icon +
      '</span> ' +
      tier.label;

    verifyStatus.parentNode.insertBefore(el, verifyStatus.nextSibling);
    return true;
  }

  // 1) Patch renderProfile nếu function đã tồn tại
  function patchRenderProfile() {
    if (typeof window.renderProfile !== 'function') return false;
    if (window.__b4WorkerTierPatched) return true;
    window.__b4WorkerTierPatched = true;

    var original = window.renderProfile;
    window.renderProfile = function (profile, jobs, ratingDetail, isViewingOther) {
      if (profile && ratingDetail) {
        if (!profile.tier && ratingDetail.tier) profile.tier = ratingDetail.tier;
        if (!profile.tier_label && ratingDetail.tier_label) {
          profile.tier_label = ratingDetail.tier_label;
        }
      }
      original(profile, jobs, ratingDetail, isViewingOther);
      try {
        var src = profile || {};
        if (ratingDetail && (ratingDetail.tier || ratingDetail.tier_label)) {
          src = Object.assign({}, profile || {}, {
            tier: (profile && profile.tier) || ratingDetail.tier,
            tier_label: (profile && profile.tier_label) || ratingDetail.tier_label
          });
        }
        injectTierBadge(src);
      } catch (e) {
        console.warn('[B4] tier inject after renderProfile failed', e);
      }
    };
    return true;
  }

  // 2) Nếu profile đã render (verify-status có text) mà chưa có badge → fetch API
  function tryInjectFromApi() {
    if (document.getElementById('b4-tier-badge')) return;
    var verifyStatus = document.getElementById('verify-status');
    if (!verifyStatus || !verifyStatus.textContent.trim()) return;

    var token = localStorage.getItem('token');
    if (!token) {
      injectTierBadge({ tier: 'bronze' });
      return;
    }

    var urlParams = new URLSearchParams(window.location.search);
    var workerId = urlParams.get('worker_id');
    var apiUrl = workerId
      ? '/api/worker/' + workerId + '/profile/'
      : '/api/profile/';

    fetch(apiUrl, {
      headers: { Authorization: 'Bearer ' + token }
    })
      .then(function (r) {
        if (!r.ok) throw new Error('api ' + r.status);
        return r.json();
      })
      .then(function (data) {
        injectTierBadge(data || { tier: 'bronze' });
      })
      .catch(function () {
        injectTierBadge({ tier: 'bronze' });
      });
  }

  // 3) Quan sát DOM — khi verify-status được JS trang đổ nội dung
  function watchVerifyStatus() {
    var target = document.getElementById('verify-status');
    if (!target) return;

    var obs = new MutationObserver(function () {
      if (document.getElementById('b4-tier-badge')) return;
      if (target.textContent && target.textContent.trim()) {
        tryInjectFromApi();
      }
    });
    obs.observe(target, { childList: true, characterData: true, subtree: true });

    // Trường hợp đã có nội dung sẵn
    if (target.textContent && target.textContent.trim()) {
      tryInjectFromApi();
    }
  }

  function boot() {
    patchRenderProfile();
    // Thử patch lại vài lần (race với script trang)
    var n = 0;
    var t = setInterval(function () {
      n += 1;
      patchRenderProfile();
      if (n > 30) clearInterval(t);
    }, 100);

    watchVerifyStatus();
    // Fallback trễ: profile load xong sau 1–2s
    setTimeout(tryInjectFromApi, 800);
    setTimeout(tryInjectFromApi, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
