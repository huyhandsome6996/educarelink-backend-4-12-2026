# Store Listing — Tổng hợp & Checklist Next Steps

> Trạng thái: agent đã soạn nháp đầy đủ. Các việc còn lại BẮT BUỘC chủ tài khoản tự làm.

## 📁 Những gì đã soạn sẵn trong thư mục này

| File | Nội dung | Trạng thái |
|---|---|---|
| `app-title.txt` | Tên app (30 ký tự) | ✅ Soạn xong |
| `short-description.txt` | Mô tả ngắn (80 ký tự) | ✅ Soạn xong |
| `full-description.txt` | Mô tả đầy đủ (~2000 ký tự) | ✅ Soạn xong |
| `data-safety-answers.md` | Nháp trả lời bảng Data Safety — đối chiếu từng model trong code | ✅ Soạn xong |
| `content-rating-notes.md` | Nháp điền bảng phân loại nội dung IARC | ✅ Soạn xong |
| `privacy-policy-draft.md` | Nháp chính sách quyền riêng tư | ⚠️ NHÁP — cần luật sư rà + điền email/đơn vị + host lên URL công khai |
| `screenshots-checklist.md` | Danh sách màn hình cần chụp thật | ⏳ Chờ chụp |

## 🚀 Bảng tóm tắt 2 track

| Track | Mục đích | Link (điền sau khi submit) | Ai test |
|---|---|---|---|
| **Internal testing** | Demo NGAY cho giám khảo/đối tác — không chờ đợi | [Điền opt-in URL sau bước A4] | Tối đa 100 người, thêm email là cài được ngay |
| **Closed testing (alpha)** | Chạy mốc 14 ngày + 20 người → đủ điều kiện Production | [Điền opt-in URL sau bước A5] | ≥20 người test THẬT, liên tục 14 ngày |

## 📅 Timeline ước tính tới Production

| Mốc | Thời gian | Ghi chú |
|---|---|---|
| Upload .aab lên Internal testing | Ngày 0 (hôm nay) | Demo được ngay cho giám khảo |
| Mời 20+ người vào Closed testing | Ngày 0-2 | Gửi opt-in URL + theo dõi trong Play Console |
| Chạy mốc 14 ngày liên tục | Ngày 0 → 14 | Google tự đếm khi đủ 20 tester đang opt-in |
| Đủ điều kiện Production | Ngày 14+ | Play Console hiện trạng thái đủ điều kiện |
| Bấm publish Production | Sau ngày 14 | ⚠️ CHỦ TÀI KHOẢN tự bấm — agent KHÔNG tự publish |

## ✅ Checklist việc CHỦ TÀI KHOẢN cần tự làm

1. [ ] Upload .aab lần đầu nếu API không cho submit app mới (link file trong báo cáo build)
2. [ ] Chụp 4-8 ảnh màn hình thật (xem screenshots-checklist.md)
3. [ ] Resize icon về 512x512 + làm feature graphic 1024x500
4. [ ] Rà soát privacy policy với người có thẩm quyền, điền email/đơn vị, host lên URL công khai, dán link vào Play Console
5. [ ] Điền Store listing từ các file .txt vào Play Console
6. [ ] Điền bảng Data safety theo data-safety-answers.md
7. [ ] Điền bảng Content rating theo content-rating-notes.md
8. [ ] Copy 2 link opt-in URL (Internal + Closed testing) gửi giám khảo / mời 20 người
9. [ ] Theo dõi 14 ngày trong Play Console (Dashboard → eligibility)
10. [ ] Khi đủ điều kiện: TỰ TAY bấm "Publish to production" (KHÔNG để agent làm)

## ⚠️ Lưu ý quan trọng
- Nếu Google yêu cầu **xác minh nhà phát triển** (video/ID) → làm theo hướng dẫn trong email Google, không phải lỗi hệ thống.
- Google có thể yêu cầu khai báo **Family policy / trẻ em** vì app liên quan chăm sóc trẻ — đã ghi chú trong content-rating-notes.md (app dành cho người lớn, không thu thập dữ liệu trẻ em trực tiếp).
- KHÔNG cố bypass mốc 14 ngày/20 người — vi phạm chính sách sẽ bị khóa tài khoản.
