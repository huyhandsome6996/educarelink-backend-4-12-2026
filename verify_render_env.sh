#!/bin/bash
# ====================================================================
# verify_render_env.sh — Verify Render Cron Job "educarelink-tracking-scheduler"
#                       có đủ env vars để chạy tracking scheduler an toàn.
#
# Bối cảnh (QA-FIX-3 + QA-FIX-6 HANDOFF):
#   Scheduler offline-detection + verification-PIN đã được tách khỏi web
#   service thành 1 Render Cron Job riêng tên "educarelink-tracking-scheduler",
#   chạy mỗi 1 phút: `python manage.py run_tracking_schedulers --once --only both`.
#
#   Cron Job là 1 service type độc lập trên Render → KHÔNG tự inherit env vars
#   từ web service. Nếu thiếu SECRET_KEY hoặc DATABASE_URL → scheduler sẽ crash
#   silent (cron fail nhưng web service vẫn chạy bình thường) → tính năng
#   offline detection / random PIN verification sẽ silent fail → an toàn
#   CarePartner bị gãy mà không ai biết.
#
# Cách dùng:
#   1) Sau khi merge PR + deploy backend, vào Render Dashboard config env
#      vars cho Cron Job theo README_RENDER_CRON_SETUP.md.
#   2) Chạy script này để verify:
#        bash verify_render_env.sh
#      Script sẽ gọi API scheduler-health và đọc response.
#
# Exit codes:
#   0 — scheduler health OK (status=ok)
#   1 — scheduler health FAIL hoặc không reach được backend
#   2 — thiếu RENDER_BACKEND_URL env var
# ====================================================================

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────
# Render backend URL — override via env var nếu cần
DEFAULT_BACKEND_URL="https://educarelink-backend.onrender.com"
BACKEND_URL="${RENDER_BACKEND_URL:-$DEFAULT_BACKEND_URL}"
HEALTH_ENDPOINT="/api/tracking/scheduler-health/"
HEALTH_URL="${BACKEND_URL}${HEALTH_ENDPOINT}"

# Timeout cho curl (seconds) — Render free tier cold start có thể mất 30s
CURL_TIMEOUT=60

# ── Helper ──────────────────────────────────────────────────────────
log()  { echo "[$(date '+%H:%M:%S')] $*"; }
ok()   { echo "✅ $*"; }
warn() { echo "⚠️  $*" >&2; }
err()  { echo "❌ $*" >&2; }

# ── Main ────────────────────────────────────────────────────────────
echo "============================================================"
echo "  Verify Render Cron Job env — EduCareLink Tracking Scheduler"
echo "============================================================"
echo ""
log "Backend URL: $BACKEND_URL"
log "Health endpoint: $HEALTH_URL"
echo ""

# Bước 1: Wake up web service (Render free tier có thể sleep)
log "Bước 1/4: Wake up web service (Render free tier có thể sleep)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time "$CURL_TIMEOUT" \
    "${BACKEND_URL}/api/health/" || echo "000")

if [[ "$HTTP_CODE" != "200" ]]; then
    warn "Web service health endpoint trả HTTP $HTTP_CODE (có thể đang cold start)."
    warn "Retry sau 10s..."
    sleep 10
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time "$CURL_TIMEOUT" \
        "${BACKEND_URL}/api/health/" || echo "000")
fi

if [[ "$HTTP_CODE" == "200" ]]; then
    ok "Web service online (HTTP 200)"
else
    err "Web service không reach được (HTTP $HTTP_CODE)."
    err "→ Kiểm tra RENDER_BACKEND_URL hoặc trạng thái Render web service."
    exit 1
fi
echo ""

# Bước 2: Đợi cron chạy lần tiếp theo (≤ 1 phút)
log "Bước 2/4: Đợi ≤60s để Render Cron Job chạy lần tiếp theo..."
log "  (Cron chạy mỗi 1 phút — wait để health status refresh)"
sleep 60
ok "Đã đợi 60s"
echo ""

# Bước 3: Gọi scheduler-health endpoint
log "Bước 3/4: Gọi scheduler-health endpoint..."
RESPONSE=$(curl -s --max-time "$CURL_TIMEOUT" "$HEALTH_URL" 2>&1) || {
    err "Không reach được $HEALTH_URL"
    err "→ Backend chưa deploy endpoint này (cần merge PR + deploy)"
    exit 1
}

log "Raw response: $RESPONSE"
echo ""

# Bước 4: Parse response — extract status field
log "Bước 4/4: Parse response..."
# Dùng python để parse JSON an toàn (tránh dependency jq)
STATUS=$(echo "$RESPONSE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('status', ''))
except Exception as e:
    print('PARSE_ERROR', end='')
    sys.exit(0)
" 2>&1 || echo "PARSE_ERROR")

if [[ "$STATUS" == "PARSE_ERROR" ]]; then
    err "Response không phải JSON hợp lệ."
    err "→ Có thể endpoint trả HTML error page (Render routing sai) hoặc 500."
    exit 1
fi

echo ""
echo "============================================================"
echo "  KẾT QUẢ: scheduler-health status = '$STATUS'"
echo "============================================================"

if [[ "$STATUS" == "ok" ]]; then
    ok "✅ Scheduler env config ĐÚNG — Cron Job có đủ SECRET_KEY + DATABASE_URL."
    ok "   Tính năng offline-detection + random PIN verification sẽ chạy đúng."
    echo ""
    log "Chi tiết response:"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
    exit 0
else
    err "❌ Scheduler env config SAI hoặc chưa set."
    echo ""
    echo "────────────────────────────────────────────────────────────"
    echo "  Nguyên nhân có thể + cách khắc phục:"
    echo "────────────────────────────────────────────────────────────"
    echo ""
    echo "1) THIẾU env vars trong Cron Job (NGUYÊN NHÂN PHỔ BIẾN NHẤT)"
    echo "   → Vào Render Dashboard → Cron Job 'educarelink-tracking-scheduler'"
    echo "     → Environment tab → verify có 2 vars sau:"
    echo "       • SECRET_KEY  (copy từ web service — cùng giá trị)"
    echo "       • DATABASE_URL (copy từ web service — cùng giá trị)"
    echo "   → Save → đợi ≤1 phút cron chạy lại → re-run script này."
    echo ""
    echo "2) DATABASE_URL sai / DB không kết nối được"
    echo "   → status thường là 'db_error' hoặc 'error' kèm message"
    echo "   → Vào Cron Job logs (Dashboard → Cron Job → Logs tab)"
    echo "   → Tìm line chứa 'OperationalError' hoặc 'connection refused'"
    echo "   → Fix: copy đúng DATABASE_URL từ web service (cùng Supabase"
    echo "     PostgreSQL URL, format postgresql://user:pass@host:5432/dbname)"
    echo ""
    echo "3) SECRET_KEY sai (cron dùng key khác với web service)"
    echo "   → JWT token verify fail khi scheduler gọi internal API"
    echo "   → status thường là 'auth_error' hoặc 'unauthorized'"
    echo "   → Fix: copy đúng SECRET_KEY từ web service env vars."
    echo ""
    echo "4) TRACKING_OFFLINE_CHECK_ENABLED=false trong env"
    echo "   → Scheduler chạy nhưng skip offline detection"
    echo "   → status='ok' nhưng offline alert không gửi"
    echo "   → Fix: set TRACKING_OFFLINE_CHECK_ENABLED=true (default 'true')"
    echo "     trong Cron Job env vars."
    echo ""
    echo "5) Cron Job chưa trigger (lịch cron sai)"
    echo "   → Render Cron Job expression phải là '* * * * *' (mỗi 1 phút)"
    echo "   → Vào Dashboard → Cron Job → Settings → verify schedule expression"
    echo ""
    echo "6) Cron Job chạy nhưng crash trước khi set health"
    echo "   → Render Cron Job logs sẽ có Python traceback"
    echo "   → Tìm: 'ImportError', 'ModuleNotFoundError', 'KeyError'"
    echo "   → Fix: re-deploy Cron Job sau khi merge PR (Render auto-deploy"
    echo "     từ main branch)"
    echo ""
    echo "────────────────────────────────────────────────────────────"
    echo "  Tham khảo: README_RENDER_CRON_SETUP.md"
    echo "────────────────────────────────────────────────────────────"
    exit 1
fi
