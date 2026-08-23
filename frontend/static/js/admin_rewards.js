
// B2 Admin Rewards panel
async function loadRewardsAdmin() {
  const body = document.getElementById('tableBody');
  body.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const [vRes, rRes] = await Promise.all([
      apiFetch(API_BASE + '/admin/rewards/vouchers/'),
      apiFetch(API_BASE + '/admin/rewards/redemptions/'),
    ]);
    if (!vRes.ok) {
      body.innerHTML = '<div class="empty-state"><div class="empty-title">Không tải được voucher (cần quyền Admin)</div></div>';
      return;
    }
    const vouchers = await vRes.json();
    const redemptions = rRes.ok ? await rRes.json() : [];
    let html = '';
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
    html += '<button onclick="createVoucher()" class="btn" style="margin-top:12px;background:#F26522;color:#fff;padding:10px 20px;border:none;border-radius:10px;font-weight:700;cursor:pointer;">+ Tạo voucher</button>';
    html += '</div>';
    html += '<div style="background:#0f172a;border:1px solid #334155;border-radius:14px;padding:20px;">';
    html += '<div style="font-weight:800;font-size:15px;margin-bottom:14px;color:#f1f5f9;">Điều chỉnh điểm phụ huynh</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">';
    html += '<input id="adjUserId" type="number" min="1" placeholder="User ID phụ huynh" style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:10px;color:#f1f5f9;font-size:13px;width:160px;"/>';
    html += '<input id="adjPoints" type="number" placeholder="Điểm (+/-)" style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:10px;color:#f1f5f9;font-size:13px;width:120px;"/>';
    html += '<input id="adjNote" placeholder="Ghi chú" style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:10px;color:#f1f5f9;font-size:13px;flex:1;min-width:160px;"/>';
    html += '<button onclick="adjustPoints()" class="btn" style="background:#22c55e;color:#fff;padding:10px 16px;border:none;border-radius:10px;font-weight:700;cursor:pointer;">Áp dụng</button>';
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
        html += '<button class="btn btn-sm ' + (v.is_active ? 'btn-lock' : 'btn-unlock') + '" onclick="toggleVoucherActive(' + v.id + ', ' + (!v.is_active) + ')">' + (v.is_active ? 'Tắt' : 'Bật') + '</button> ';
        html += '<button class="btn btn-sm btn-reject" onclick="deleteVoucher(' + v.id + ')">Xóa</button></div></td></tr>';
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
        html += '<td style="font-size:12px;color:#94a3b8;">' + escapeHtml(String(r.redeemed_at || '').replace('T',' ').slice(0,16)) + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div></div>';
    body.innerHTML = html;
  } catch (e) {
    console.error(e);
    body.innerHTML = '<div class="empty-state"><div class="empty-title">Lỗi kết nối</div></div>';
  }
}

async function createVoucher() {
  var title = document.getElementById('vTitle').value.trim();
  var points_required = parseInt(document.getElementById('vPoints').value, 10);
  var discount_value = parseInt(document.getElementById('vDiscount').value, 10);
  var description = document.getElementById('vDesc').value.trim();
  var expiry_date = document.getElementById('vExpiry').value || null;
  if (!title || !points_required || !discount_value) { showToast('Điền đủ tiêu đề, điểm và trị giá', 'error'); return; }
  try {
    var res = await apiFetch(API_BASE + '/admin/rewards/vouchers/', {
      method: 'POST',
      body: JSON.stringify({ title: title, points_required: points_required, discount_value: discount_value, description: description, expiry_date: expiry_date, is_active: true }),
    });
    var data = await res.json();
    if (!res.ok) { showToast(data.error || 'Tạo thất bại', 'error'); return; }
    showToast('Đã tạo voucher', 'success');
    loadRewardsAdmin();
  } catch (e) { showToast('Lỗi kết nối', 'error'); }
}

async function toggleVoucherActive(id, isActive) {
  try {
    var res = await apiFetch(API_BASE + '/admin/rewards/vouchers/' + id + '/', {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive }),
    });
    if (!res.ok) { var d = await res.json().catch(function(){return {};}); showToast(d.error || 'Lỗi', 'error'); return; }
    showToast(isActive ? 'Đã bật voucher' : 'Đã tắt voucher', 'success');
    loadRewardsAdmin();
  } catch (e) { showToast('Lỗi kết nối', 'error'); }
}

async function deleteVoucher(id) {
  if (!confirm('Xóa voucher này?')) return;
  try {
    var res = await apiFetch(API_BASE + '/admin/rewards/vouchers/' + id + '/', { method: 'DELETE' });
    var data = await res.json().catch(function(){return {};});
    if (!res.ok) { showToast(data.error || 'Xóa thất bại', 'error'); return; }
    showToast(data.message || 'Đã xóa', 'success');
    loadRewardsAdmin();
  } catch (e) { showToast('Lỗi kết nối', 'error'); }
}

async function adjustPoints() {
  var user_id = parseInt(document.getElementById('adjUserId').value, 10);
  var points = parseInt(document.getElementById('adjPoints').value, 10);
  var note = document.getElementById('adjNote').value.trim();
  if (!user_id || !points) { showToast('Nhập User ID và số điểm khác 0', 'error'); return; }
  try {
    var res = await apiFetch(API_BASE + '/admin/rewards/adjust-points/', {
      method: 'POST',
      body: JSON.stringify({ user_id: user_id, points: points, note: note }),
    });
    var data = await res.json();
    if (!res.ok) { showToast(data.error || 'Thất bại', 'error'); return; }
    showToast(data.message + ' (số dư: ' + data.balance + ')', 'success');
  } catch (e) { showToast('Lỗi kết nối', 'error'); }
}
