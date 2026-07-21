# Báo cáo rà soát lịch sử git: `db.sqlite3`

> Phát hiện lần cuối: 2026-07-21 (nhánh `fix/audit-2026-07-21`)
> Agent thực hiện: Z.ai (theo yêu cầu từ `PHAN_TICH_REPO_EDUCARELINK.md`, mục L1)

---

## 1. Tổng quan

`db.sqlite3` đã bị `git add` và commit từ rất sớm (commit `f622cbc9` ngày 2026-04-12). Mặc dù `.gitignore` có dòng `db.sqlite3`, git không có tác dụng hồi tố đối với file đã được track. Có **11 commit** chạm vào file này từ 2026-04-12 đến 2026-06-27.

File `db.sqlite3` hiện vẫn còn trong working tree ở local để chạy dev, nhưng đã được gỡ khỏi git index bằng `git rm --cached db.sqlite3` (commit riêng, KHÔNG sửa history).

## 2. Phát hiện dữ liệu thật (PII) trong lịch sử git

Rà soát 11 version của `db.sqlite3` cho thấy **CÓ dữ liệu người dùng thật** trong history — cụ thể ở bảng `core_user`. **Không phát hiện** dữ liệu nhạy cảm hình ảnh (bảng `core_credentialsubmission` rỗng trong toàn bộ history).

### 2.1. Tài khoản có dấu hiệu là dữ liệu thật

| commit | user_id | username | email | phone | first_name | last_name |
|---|---|---|---|---|---|---|
| `e4dba138` (2026-06-12) trở đi | 6 | `iamdoinb6996@gmail.commmmmm` | `iamdoinb6996@gmail.com` | `0862427404` | Huy | Hồ |
| `e4dba138` (2026-06-12) trở đi | 7 | `test` | `highschoolofthedead252@gmail.com` | `0981636166` | B | A |

**Đánh giá:**

- **user_id=6** — email `iamdoinb6996@gmail.com`:
  - Domain `gmail.com` là mail provider thật, không phải `@test.com` / `@example.com` / `@demo.com`.
  - Username GitHub của repo là `huyhandsome6996` — cùng số `6996`, cùng họ tên (Huy Hồ) → gần như chắc chắn đây là **email cá nhân thật của chủ repo**.
  - SĐT `0862427404` là số Viettel 10 số, định dạng hợp lệ tại VN — rất có thể là SĐT thật.

- **user_id=7** — email `highschoolofthedead252@gmail.com`:
  - Domain `gmail.com` thật, không khớp pattern demo.
  - SĐT `0981636166` là số Viettel 10 số, định dạng hợp lệ.
  - Đây có thể là email của một người quen được mời test thử, không loại trừ khả năng là tài khoản cá nhân thật.

> **Mức độ nhạy cảm**: email cá nhân + SĐT cá nhân. Không có ảnh CCCD, không có mật khẩu plaintext (Django chỉ lưu hash), không có thông tin tài khoản ngân hàng.

### 2.2. Các tài khoản khác trong db.sqlite3

Các tài khoản còn lại (user_id 11–18, các `phuhuynh_*` / `carepartner_*` / `locked_vipham`) có:

- Email dùng domain `@email.com` — đây là domain không tồn tại như mail provider, thường được dùng làm placeholder trong seed script. **Nhìn bề ngoài giống dữ liệu thật** (có tên người VN), nhưng thực chất là dữ liệu demo do script seed tạo ra.
- SĐT dạng sequential rõ ràng fake: `0982222222`, `0983333333`, `0984444444`, `0985555555`, `0986666666`, `0912345678`, `0923456789`, `0934567890`.

Các tài khoản này **không được coi là PII thật**, nhưng vì trông giống thật nên vẫn liệt kê để user tự đánh giá.

### 2.3. Bảng `core_credentialsubmission`

Trong toàn bộ 11 version của `db.sqlite3`, bảng `core_credentialsubmission` **rỗng** (0 row). Tức là không có ảnh CCCD / chân dung / bằng cấp thật bị đẩy lên git history. Đây là điểm an toàn quan trọng nhất.

## 3. Hành động đã thực hiện (trên nhánh `fix/audit-2026-07-21`)

1. `git rm --cached db.sqlite3` — gỡ file khỏi git index, file vẫn còn ở local để chạy dev. Hành động này **không sửa git history**, chỉ ngăn các commit tương lai tiếp tục track file này.
2. Commit riêng cho thay đổi này (xem `git log` nhánh `fix/audit-2026-07-21`, commit message: `chore: gỡ db.sqlite3 khỏi git tracking (file đã có trong .gitignore)`).

## 4. Hành động CẦN XÁC NHẬN từ user — KHÔNG tự ý làm

Lịch sử git cũ vẫn còn chứa `db.sqlite3` với email + SĐT cá nhân (user_id 6, 7). Có 2 lựa chọn, mỗi cái có đánh đổi riêng — user cần chọn:

### Lựa chọn A: Rewrite git history (lý tưởng về bảo mật, rủi ro về vận hành)

- Dùng `git filter-repo` (hoặc BFG Repo-Cleaner) để xoá `db.sqlite3` khỏi toàn bộ history.
- **force push** tất cả nhánh (`main`, các nhánh feature/backup) — bắt buộc.
- **Yêu cầu tất cả collaborator/agent clone lại từ đầu** — mọi local clone cũ đều invalid.
- **Render.com deploy** có thể bị ảnh hưởng vì build cache dựa trên git history. Cần kiểm tra.
- Lợi ích: dữ liệu PII không còn trong history → không thể bị scrape sau này.

### Lựa chọn B: Không rewrite, xử lý ở tầng khác (an toàn vận hành, chấp nhận rủi ro dư)

- Để nguyên history.
- **Rotate/thay đổi**: vì PII lộ là email + SĐT (không phải mật khẩu, không phải secret key), có thể xử lý bằng cách:
  - Đổi email `iamdoinb6996@gmail.com` sang alias khác, hoặc setup filter spam chặt hơn.
  - Đổi SĐT Viettel `0862427404` (sau khi đã công khai trên GitHub public, số này có thể nhận spam/scam call).
- Tạo cron job check repo mirror (vd: GitHub Advisory) xem có ai fork/scrape không.
- Lợi ích: không phá vỡ local clone của team. Rủi ro dư: PII vẫn nằm trên GitHub public history.

### Khuyến nghị của agent

Vì đây là repo **public trên GitHub**, dữ liệu đã có khả năng bị bot scrape ngay khi commit. **Lựa chọn A** (rewrite history) là an toàn hơn cho dài hạn, **đặc biệt nếu email/SĐT này vẫn đang được dùng làm kênh liên lạc chính của user**. Tuy nhiên:

- User cần xác nhận **không có ai khác đang giữ local clone cũ** mà không được thông báo, để tránh push ngược lại history cũ.
- User cần xác nhận **sẵn sàng force push lên main** và **re-deploy trên Render**.

## 5. Câu hỏi cần user trả lời trước khi làm tiếp

1. Email `iamdoinb6996@gmail.com` và SĐT `0862427404` có còn được dùng làm kênh cá nhân không? Có cần rotate không?
2. Có chọn **Lựa chọn A** (rewrite history) không? Nếu có, agent sẽ tạo branch `chore/rewrite-history-remove-db` riêng, chạy `git filter-repo`, force push, và viết hướng dẫn re-clone cho team. Nếu không, agent sẽ note lại vào `FIX_REPORT_2026-07-21.md` rằng history được giữ nguyên theo quyết định của user.

---

*File này được tạo trên nhánh `fix/audit-2026-07-21` cùng commit với `git rm --cached db.sqlite3` để lưu vết cho PR review.*
