// B2 Admin Rewards panel
// Không re-render form khi user đang gõ (tránh mất dữ liệu do setInterval)

var _rewardsFormDirty = false;
var _rewardsLoadedOnce = false;

function _bindRewardsFormGuard() {
  ['vTitle', 'vPoints', 'vDiscount', 'vExpiry', 'vDesc', 'adjUserId', 'adjPoints', 'adjNote'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el || el.dataset.guardBound) return;
    el.dataset.guardBound = '1';
    el.addEventListener('input', function() { _rewardsFormDirty = true; });
    el.addEventListener('change', function() { _rewardsFormDirty = true; });
  });
}

async function loadRewardsAdmin(force) {
  // force=true: sau khi tạo/xóa/sửa — luôn reload
  // force=false/undefined: từ setInterval — bỏ qua nếu form đang có dữ liệu
  if (!force && _rewardsLoadedOnce && _rewardsFormDirty) {
    return;
  }
  if (!force && _rewardsLoadedOnce && document.activeElement) {
    var activeId = document.activeElement.id || '';
    if (['vTitle', 'vPoints', 'vDiscount', 'vExpiry', 'vDesc', 'adjUserId', 'adjPoints', 'adjNote'].indexOf(activeId) >= 0) {
      return;
    }
  }

  var body = document.getElementById('tableBody');
  if (!body) return;

  // Giữ form values nếu đang dirty (chỉ refresh phần list)
  var saved = null;
  if (_rewardsFormDirty) {
    saved = {
      title: (document.getElementById('vTitle') || {}).value || '',
      points: (document.getElementById('vPoints') || {}).value || '',
      discount: (document.getElementById('vDiscount') || {}).value || '',
      expiry: (document.getElementById('vExpiry') || {}).value || '',
      desc: (document.getElementById('vDesc') || {}).value || '',
      adjUserId: (document.getElementById('adjUserId') || {}).value || '',
      adjPoints: (document.getElementById('adjPoints') || {}).value || '',
      adjNote: (document.getElementById('adjNote') || {}).value || '',
    };
  }

  body.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    var results = await Promise.all([
      apiFetch(API_BASE + '/admin/rewards/vouchers/'),
      apiFetch(API_BASE + '/admin/rewards/redemptions/'),
    ]);
    var vRes = results[0];
    var rRes = results[1];
    if (!vRes.ok) {
      var errText = 'Không tải được voucher (cần quyền Admin)';
      try {
        var errData = await vRes.json();
        if (errData.detail) errText = errData.detail;
        else if (errData.error) errText = errData.error;
      } catch (ignore) {}
      body.innerHTML = '<div class="empty-state"><div class="empty-title">' + escapeHtml(errText) + ' (HTTP ' + vRes.status + ')</div></div>';
      return;
    }
    var vouchers = await vRes.json();
    var redemptions = rRes.ok ? await rRes.json() : [];
    var html = '';
    html += '<div style="padding:20px;display:flex;flex-direction:column;gap:24px;">';
    html += '<div style="background:#0f172a;border:1px solid #334155;border-radius:14px;padding:20px;">';
    html += '<div style="font-weight:800;font-size:15px;margin-bottom:14px;color:#f1f5f9;">Tạo voucher mới</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">';
    html += '<input id="vTitle" placeholder="Tiêu đề *" style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:10px;color:#f1f5f9;font-size:13px;"/>';
    html += '<input id="vPoints" type="number" min="1" placeholder="Điểm cần *" style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:10px;color:#f1f5f9;font-size:13px;"/>';
    html += '<input id="vDiscount" type="number" min="1" placeholder="Trị giá (VNĐ) *" style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:10px;color:#f1f5f9;font-size:13px;"/>';
    html += '<input id="vExpiry" type="date" style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:10px;color:#f1f5f9;font-size:13px;"/>';
    html += '</div>';
    html += '<textarea id="vDesc" placeholder="Mô tả (tuỳ chọn)" style="width:100%;margin-top:10px;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:10px;color:#f1f5f9;font-size:13px;min-height:60px;font-family:inherit;"></textarea>';
    html += '<button type="button" onclick="createVoucher()" class="btn" style="margin-top:12px;background:#F26522;color:#fff;padding:10px 20px;border:none;border-radius:10px;font-weight:700;cursor:pointer;">+ Tạo voucher</button>';
    html += '</div>';
    html += '<div style="background:#0f172a;border:1px solid #334155;border-radius:14px;padding:20px;">';
    html += '<div style="font-weight:800;font-size:15px;margin-bottom:14px;color:#f1f5f9;">Điều chỉnh điểm phụ huynh</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">';
    html += '<input id="adjUserId" type="number" min="1" placeholder="User ID phụ huynh" style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:10px;color:#f1f5f9;font-size:13px;width:160px;"/>';
    html += '<input id="adjPoints" type="number" placeholder="Điểm (+/-)" style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:10px;color:#f1f5f9;font-size:13px;width:120px;"/>';
    html += '<input id="adjNote" placeholder="Ghi chú" style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:10px;color:#f1f5f9;font-size:13px;flex:1;min-width:160px;"/>';
    html += '<button type="button" onclick="adjustPoints()" class="btn" style="background:#22c55e;color:#fff;padding:10px 16px;border:none;border-radius:10px;font-weight:700;cursor:pointer;">Áp dụng</button>';
    html += '</div>';
    html += '<div style="font-size:11px;color:#64748b;margin-top:8px;">Ví dụ: +50 cộng điểm, -10 trừ điểm. Chỉ áp dụng cho role parent.</div>';
    html += '</div>';
    html += '<div><div style="font-weight:800;font-size:15px;margin-bottom:12px;color:#f1f5f9;">Danh sách voucher (' + vouchers.length + ')</div>';
    if (!vouchers.length) {
      html += '<div class="empty-state" style="padding:30px;"><div class="empty-title">Chưa có voucher</div></div>';
    } else {
      html += '<table><thead><tr><th>Voucher</th><th>Điểm</th><th>Trị giá</th><th>Hạn</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>';
      vouchers.forEach(function(v) {
        var active = v.is_active && !v.is_expired;
        html += '<tr><td><div class="user-name">' + escapeHtml(v.title) + '</div></td>';
        html += '<td style="font-weight:700;color:#f59e0b;">' + v.points_required + '</td>';
        html += '<td style="color:#22c55e;font-weight:700;">' + Number(v.discount_value).toLocaleString('vi-VN') + 'đ</td>';
        html += '<td style="font-size:12px;color:#94a3b8;">' + (v.expiry_date || 'Không hạn') + '</td>';
        html += '<td><span class="badge ' + (active ? 'badge-active' : 'badge-inactive') + '">' + (active ? 'Đang mở' : 'Tắt') + '</span></td>';
        html += '<td><div class="action-btns">';
        html += '<button type="button" class="btn btn-sm ' + (v.is_active ? 'btn-lock' : 'btn-unlock') + '" onclick="toggleVoucherActive(' + v.id + ', ' + (!v.is_active) + ')">' + (v.is_active ? 'Tắt' : 'Bật') + '</button> ';
        html += '<button type="button" class="btn btn-sm btn-reject" onclick="deleteVoucher(' + v.id + ')">Xóa</button></div></td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div><div><div style="font-weight:800;font-size:15px;margin:8px 0 12px;color:#f1f5f9;">Mã đã đổi gần đây (' + redemptions.length + ')</div>';
    if (!redemptions.length) {
      html += '<div style="color:#64748b;font-size:13px;padding:12px;">Chưa có phụ huynh nào đổi voucher.</div>';
    } else {
      html += '<table><thead><tr><th>Mã</th><th>Phụ huynh</th><th>Voucher</th><th>Điểm</th><th>Trạng thái</th><th>Thời gian</th></tr></thead><tbody>';
      redemptions.forEach(function(r) {
        html += '<tr><td><code style="font-weight:800;">' + escapeHtml(r.code) + '</code></td>';
        html += '<td><div class="user-name">' + escapeHtml(r.user_name || '') + '</div><div class="user-username">@' + escapeHtml(r.username || '') + '</div></td>';
        html += '<td>' + escapeHtml(r.voucher_title || '') + '</td>';
        html += '<td style="color:#ef4444;font-weight:700;">-' + r.points_spent + '</td>';
        html += '<td><span class="badge badge-approved">' + escapeHtml(r.status_display || r.status) + '</span></td>';
        html += '<td style="font-size:12px;color:#94a3b8;">' + escapeHtml(String(r.redeemed_at || '').replace('T', ' ').slice(0, 16)) + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div></div>';
    body.innerHTML = html;

    // Restore form values nếu bị reload giữa lúc gõ
    if (saved) {
      if (document.getElementById('vTitle')) document.getElementById('vTitle').value = saved.title;
      if (document.getElementById('vPoints')) document.getElementById('vPoints').value = saved.points;
      if (document.getElementById('vDiscount')) document.getElementById('vDiscount').value = saved.discount;
      if (document.getElementById('vExpiry')) document.getElementById('vExpiry').value = saved.expiry;
      if (document.getElementById('vDesc')) document.getElementById('vDesc').value = saved.desc;
      if (document.getElementById('adjUserId')) document.getElementById('adjUserId').value = saved.adjUserId;
      if (document.getElementById('adjPoints')) document.getElementById('adjPoints').value = saved.adjPoints;
      if (document.getElementById('adjNote')) document.getElementById('adjNote').value = saved.adjNote;
    } else {
      _rewardsFormDirty = false;
    }
    _rewardsLoadedOnce = true;
    _bindRewardsFormGuard();
  } catch (e) {
    console.error('loadRewardsAdmin error:', e);
    body.innerHTML = '<div class="empty-state"><div class="empty-title">Lỗi kết nối: ' + escapeHtml(String(e.message || e)) + '</div></div>';
  }
}

async function createVoucher() {
  var titleEl = document.getElementById('vTitle');
  var pointsEl = document.getElementById('vPoints');
  var discountEl = document.getElementById('vDiscount');
  var descEl = document.getElementById('vDesc');
  var expiryEl = document.getElementById('vExpiry');
  if (!titleEl || !pointsEl || !discountEl) {
    showToast('Form chưa sẵn sàng, thử F5 rồi mở lại tab Voucher', 'error');
    return;
  }
  var title = titleEl.value.trim();
  var points_required = parseInt(pointsEl.value, 10);
  var discount_value = parseInt(discountEl.value, 10);
  var description = (descEl && descEl.value || '').trim();
  var expiry_date = (expiryEl && expiryEl.value) || null;
  if (!title || !points_required || !discount_value) {
    showToast('Điền đủ tiêu đề, điểm và trị giá', 'error');
    return;
  }
  try {
    var res = await apiFetch(API_BASE + '/admin/rewards/vouchers/', {
      method: 'POST',
      body: JSON.stringify({
        title: title,
        points_required: points_required,
        discount_value: discount_value,
        description: description,
        expiry_date: expiry_date,
        is_active: true,
      }),
    });
    var data = {};
    try { data = await res.json(); } catch (parseErr) {
      showToast('Server trả về lỗi (HTTP ' + res.status + ')', 'error');
      return;
    }
    if (!res.ok) {
      showToast(data.error || data.detail || ('Tạo thất bại HTTP ' + res.status), 'error');
      return;
    }
    showToast('Đã tạo voucher', 'success');
    _rewardsFormDirty = false;
    loadRewardsAdmin(true);
  } catch (e) {
    console.error('createVoucher error:', e);
    showToast('Lỗi kết nối: ' + (e.message || e), 'error');
  }
}

async function toggleVoucherActive(id, isActive) {
  try {
    var res = await apiFetch(API_BASE + '/admin/rewards/vouchers/' + id + '/', {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive }),
    });
    if (!res.ok) {
      var d = await res.json().catch(function() { return {}; });
      showToast(d.error || d.detail || 'Lỗi', 'error');
      return;
    }
    showToast(isActive ? 'Đã bật voucher' : 'Đã tắt voucher', 'success');
    loadRewardsAdmin(true);
  } catch (e) {
    console.error(e);
    showToast('Lỗi kết nối: ' + (e.message || e), 'error');
  }
}

async function deleteVoucher(id) {
  if (!confirm('Xóa voucher này?')) return;
  try {
    var res = await apiFetch(API_BASE + '/admin/rewards/vouchers/' + id + '/', { method: 'DELETE' });
    var data = await res.json().catch(function() { return {}; });
    if (!res.ok) {
      showToast(data.error || data.detail || 'Xóa thất bại', 'error');
      return;
    }
    showToast(data.message || 'Đã xóa', 'success');
    loadRewardsAdmin(true);
  } catch (e) {
    console.error(e);
    showToast('Lỗi kết nối: ' + (e.message || e), 'error');
  }
}

async function adjustPoints() {
  var userEl = document.getElementById('adjUserId');
  var pointsEl = document.getElementById('adjPoints');
  var noteEl = document.getElementById('adjNote');
  if (!userEl || !pointsEl) {
    showToast('Form chưa sẵn sàng', 'error');
    return;
  }
  var user_id = parseInt(userEl.value, 10);
  var points = parseInt(pointsEl.value, 10);
  var note = (noteEl && noteEl.value || '').trim();
  if (!user_id || !points) {
    showToast('Nhập User ID và số điểm khác 0', 'error');
    return;
  }
  try {
    var res = await apiFetch(API_BASE + '/admin/rewards/adjust-points/', {
      method: 'POST',
      body: JSON.stringify({ user_id: user_id, points: points, note: note }),
    });
    var data = await res.json().catch(function() { return {}; });
    if (!res.ok) {
      showToast(data.error || data.detail || 'Thất bại', 'error');
      return;
    }
    showToast(data.message + ' (số dư: ' + data.balance + ')', 'success');
  } catch (e) {
    console.error(e);
    showToast('Lỗi kết nối: ' + (e.message || e), 'error');
  }
}
