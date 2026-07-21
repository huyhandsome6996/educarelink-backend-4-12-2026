"""Auto-generated from core/views.py — tách theo domain (L5 refactor)."""

from rest_framework import generics, status, serializers as drf_serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
import os
import logging
import requests
from django.db import models as db_models
from core.models import (User, Task, TaskApplication, ServiceCategory, Review,
                         CredentialSubmission, Notification, ProfileChangeRequest)
from core.serializers import (UserSerializer, TaskSerializer, TaskApplicationSerializer,
                              ServiceCategorySerializer, ReviewSerializer)
from core.views._helpers import (build_absolute_uri, get_tokens_for_user,
                                 send_expo_push_notification, haversine_distance,
                                 _get_platform_stats, _execute_admin_action)

logger = logging.getLogger('educarelink.core.views')

class ChatbotAPIView(APIView):
    permission_classes = [IsAuthenticated]

    # Prompt hệ thống dạy Gemini cách hoạt động trong context của Educarelink
    SYSTEM_PROMPT = """
Bạn là trợ lý AI của ứng dụng Educarelink — nền tảng kết nối phụ huynh với sinh viên/người tìm việc.
Nhiệm vụ của bạn là giúp PHỤ HUYNH đăng việc nhanh chóng thông qua hội thoại tự nhiên.

CÁC DANH MỤC DỊCH VỤ (dùng ID tương ứng):
1 = Gia sư (dạy kèm, học thêm, ôn thi)
2 = Đón trẻ (đón con, đưa đón học sinh)
3 = Dọn dẹp nhà cửa (lau dọn, vệ sinh)
4 = Trông trẻ (giữ trẻ, babysitter)
5 = Mua sắm hộ (đi chợ, mua đồ)
6 = Nấu ăn (nấu bữa cho gia đình)
7 = Hỗ trợ AI (công nghệ AI hỗ trợ học tập)
8 = Khác (chuyển đồ, thú cưng, kỹ năng sống, v.v.)

QUY TẮC XỬ LÝ:
- Nếu người dùng muốn ĐĂNG VIỆC hoặc TÌM NGƯỜI: phân tích và trả về JSON trong thẻ <TASK_JSON>...</TASK_JSON>
- Nếu thiếu thông tin bắt buộc (địa điểm, thời gian, giá): hỏi lại một cách thân thiện
- Nếu chỉ hỏi thông tin thông thường: trả lời bình thường, KHÔNG tạo JSON
- Luôn trả lời bằng TIẾNG VIỆT, thân thiện và ngắn gọn
- Sử dụng ngữ cảnh cuộc hội thoại trước đó để hiểu ý người dùng, tránh hỏi lại thông tin đã cung cấp

🔒 QUY TẮC BẮT BUỘC VỀ TIẾNG VIỆT CÓ DẤU:
- Tiêu đề (title) và mô tả (description) trong TASK_JSON PHẢI là Tiếng Việt có dấu đầy đủ
- Ví dụ ĐÚNG: "Gia sư Toán lớp 5 cho bé Minh", "Dạy kèm Tiếng Anh cho bé 10 tuổi"
- Ví dụ SAI (cấm): "Gia su Toan lop 5", "Day kem Tieng Anh", "Gia sư Toán lớp 5 cho bé Minh" (nếu bị lỗi font)
- Nếu người dùng gõ không dấu → bạn PHẢI chuyển sang có dấu khi tạo task
- Không được để lỗi font, ký tự lạ, hoặc tiếng Việt không dấu trong title/description

🔒 TÍNH NĂNG BẢO ĐẢM AN TOÀN (QUAN TRỌNG):
Khi phụ huynh muốn đăng việc thuộc 1 trong 3 danh mục:
- Gia sư (category=1)
- Đón trẻ (category=2)
- Trông trẻ (category=4)

Bạn PHẢI hỏi phụ huynh xem có muốn kích hoạt "Chế độ bảo đảm an toàn" không.

Cách hỏi:
"🔒 Để bảo vệ an toàn cho bé, anh/chị có muốn kích hoạt CHẾ ĐỘ BẢO ĐẢM AN TOÀN không?

Chế độ này sẽ:
• Vẽ vùng an toàn quanh nơi làm việc (mặc định 500m)
• Cảnh báo ngay nếu Carepartner rời vùng an toàn
• Chuông kêu + thông báo khẩn cấp nếu Carepartner tắt máy / đập máy / mất kết nối > 90 giây
• Nút SOS khẩn cấp cho cả phụ huynh và Carepartner
• Theo dõi vị trí real-time khi Carepartner đang làm việc

👉 Trả lời 'có' để bật, hoặc 'không' để bỏ qua."

Nếu phụ huynh trả lời "có" / "có nhé" / "bật đi" / "ok" / "yes" → thêm field "enable_safety": true vào TASK_JSON.
Nếu phụ huynh trả lời "không" / "không cần" / "bỏ qua" → thêm field "enable_safety": false vào TASK_JSON.

Chỉ tạo TASK_JSON khi phụ huynh đã trả lời câu hỏi an toàn (với 3 danh mục trên).

QUY TẮC ĐỊNH DẠNG CÂU TRẢ LỜI (RẤT QUAN TRỌNG):
- KHÔNG bao giờ viết 1 đoạn văn dài chình ình — RẤT KHÓ ĐỌC
- Mỗi ý phải xuống dòng riêng, dùng gạch đầu dòng "•" hoặc "-"
- Nếu có nhiều bước/hướng dẫn → đánh số thứ tự 1. 2. 3.
- Giữa các phần khác nhau → để 1 dòng trống
- Ví dụ đúng:
  Chào phụ huynh! Em có thể giúp anh/chị:

  • Đăng việc nhanh qua chat
  • Tìm gia sư, người trông trẻ
  • Hướng dẫn sử dụng app

  Anh/chị muốn làm gì ạ?
- Ví dụ SAI (cấm): "Chào phụ huynh! Em có thể giúp đăng việc, tìm gia sư, tìm người trông trẻ, hướng dẫn sử dụng app. Anh chị muốn làm gì?"

FORMAT JSON khi tạo task (bắt buộc đủ các field):
<TASK_JSON>
{
  "category": <số 1-8>,
  "title": "<Tiếng Việt có dấu, ngắn gọn>",
  "description": "<Tiếng Việt có dấu, chi tiết>",
  "location": "<địa điểm cụ thể>",
  "scheduled_time": "<YYYY-MM-DDTHH:MM:00+07:00>",
  "price": <số tiền VND, không có dấu chấm>,
  "enable_safety": <true|false, chỉ dùng cho category 1, 2, 4>
}
</TASK_JSON>

Ví dụ: Nếu người dùng nói "Tôi cần gia sư Toán lớp 8 vào tối thứ 3 tuần này ở Quận 1, trả 200k/buổi"
→ Trả lời xác nhận lại thông tin + JSON hợp lệ bên trong thẻ <TASK_JSON>.
"""

    def _build_contents(self, user_message, chat_history=None):
        """Xây dựng danh sách messages cho Gemini API với lịch sử hội thoại"""
        contents = []

        # Thêm lịch sử hội thoại nếu có
        if chat_history and isinstance(chat_history, list):
            for msg in chat_history:
                role = msg.get('role', '')
                text = msg.get('text', '')
                if role in ('user', 'model') and text:
                    contents.append({
                        'role': role,
                        'parts': [{'text': text}]
                    })

        # Thêm tin nhắn hiện tại
        contents.append({
            'role': 'user',
            'parts': [{'text': user_message}]
        })

        return contents

    def post(self, request):
        from django.conf import settings
        import json
        import re

        user_message = request.data.get('message', '').strip()
        chat_history = request.data.get('history', [])  # Nhận lịch sử hội thoại từ frontend

        if not user_message:
            return Response({"error": "Tin nhắn không được trống."}, status=status.HTTP_400_BAD_REQUEST)

        gemini_key = getattr(settings, 'GEMINI_API_KEY', '')

        # Nếu chưa cấu hình API key → fallback thân thiện
        if not gemini_key or gemini_key == 'your_gemini_api_key_here':
            return Response({
                "response": (
                    f"🤖 Tôi nhận được tin nhắn của bạn: \"{user_message}\"\n\n"
                    "⚠️ Tính năng AI chưa được kích hoạt. Vui lòng liên hệ admin để cấu hình Gemini API key.\n\n"
                    "Trong lúc đó, bạn có thể đăng việc thủ công qua nút 'Đăng việc' trên trang chủ! 👆"
                ),
                "type": "info"
            })

        try:
            from google import genai
            from performance.gemini_pool import get_pooled_gemini_client
            from performance.gemini_model import generate_content_with_fallback

            # ⚡ Dùng pooled client (singleton, tránh init 200ms mỗi call)
            client = get_pooled_gemini_client()
            if client is None:
                # Fallback: init trực tiếp nếu pool chưa sẵn sàng
                client = genai.Client(api_key=gemini_key)

            # Xây dựng nội dung với lịch sử hội thoại
            contents = self._build_contents(user_message, chat_history)

            # ⚡ Dùng fallback chain — tự thử các model nếu 1 model bị deprecated
            gemini_response, model_used = generate_content_with_fallback(
                client,
                contents=contents,
                system_instruction=self.SYSTEM_PROMPT,
                temperature=0.7,
                max_output_tokens=2048,
            )
            ai_text = gemini_response.text
            if not ai_text:
                return Response({"response": "AI không thể trả lời câu hỏi này do bộ lọc an toàn. Vui lòng thử câu hỏi khác.", "type": "error"}, status=status.HTTP_400_BAD_REQUEST)

            # Kiểm tra xem AI có trả về JSON để tạo task không
            task_json_match = re.search(r'<TASK_JSON>(.*?)</TASK_JSON>', ai_text, re.DOTALL)

            if task_json_match and request.user.role == 'parent':
                # Trích xuất JSON và tự động tạo task
                raw_json = task_json_match.group(1).strip()
                task_data = json.loads(raw_json)

                # Validate bắt buộc
                required = ['category', 'title', 'description', 'location', 'scheduled_time', 'price']
                missing = [f for f in required if not task_data.get(f)]
                if missing:
                    # Thiếu field → hỏi lại
                    clean_response = re.sub(r'<TASK_JSON>.*?</TASK_JSON>', '', ai_text, flags=re.DOTALL).strip()
                    return Response({"response": clean_response, "type": "clarification"})

                # Lấy ServiceCategory
                try:
                    category = ServiceCategory.objects.get(id=int(task_data['category']))
                except ServiceCategory.DoesNotExist:
                    category = ServiceCategory.objects.first()

                # Tạo Task trong database
                from django.utils.dateparse import parse_datetime
                scheduled = parse_datetime(task_data['scheduled_time'])
                if not scheduled:
                    raise drf_serializers.ValidationError({'scheduled_time': 'Định dạng thời gian không hợp lệ từ AI.'})
                
                try:
                    price_val = int(str(task_data['price']).replace('.', '').replace(',', '').replace('đ', '').replace('Đ', '').replace('VNĐ', '').replace('vnd', '').strip())
                except (ValueError, TypeError):
                    raise drf_serializers.ValidationError({'price': 'Định dạng giá không hợp lệ từ AI.'})

                # Xử lý enable_safety (chỉ cho category 1, 2, 4)
                enable_safety = task_data.get('enable_safety', False)
                category_id = int(task_data['category'])
                safety_enabled = bool(enable_safety and category_id in [1, 2, 4])

                # Lấy vị trí từ user để set geofence nếu safety enabled
                user_lat = float(request.data.get('latitude', 0) or getattr(request.user, 'latitude', 0) or 10.762622)
                user_lng = float(request.data.get('longitude', 0) or getattr(request.user, 'longitude', 0) or 106.660172)

                task_kwargs = {
                    'parent': request.user,
                    'category': category,
                    'title': task_data['title'],
                    'description': task_data['description'],
                    'location': task_data['location'],
                    'scheduled_time': scheduled,
                    'price': price_val,
                    'status': 'open',
                    'ai_generated_from_prompt': user_message,  # Lưu lại câu chat gốc
                }

                # Nếu safety enabled → set geofence fields
                if safety_enabled:
                    task_kwargs['geofence_lat'] = user_lat
                    task_kwargs['geofence_lng'] = user_lng
                    task_kwargs['geofence_radius'] = 500  # mặc định 500m

                new_task = Task.objects.create(**task_kwargs)

                # Trả về phản hồi sạch (không có JSON thô) + thông tin task đã tạo
                clean_response = re.sub(r'<TASK_JSON>.*?</TASK_JSON>', '', ai_text, flags=re.DOTALL).strip()
                safety_msg = ""
                if safety_enabled:
                    safety_msg = "\n\n🔒 Đã bật CHẾ ĐỘ BẢO ĐẢM AN TOÀN cho công việc này!\n• Vùng an toàn: 500m quanh địa điểm làm việc\n• Cảnh báo nếu Carepartner rời vùng\n• Chuông khẩn cấp nếu tắt máy > 90s\n• Nút SOS sẵn sàng cho cả 2 bên"
                return Response({
                    "response": clean_response + f"\n\n✅ Đã tạo công việc thành công!{safety_msg}",
                    "type": "task_created",
                    "task": {
                        "id": new_task.id,
                        "title": new_task.title,
                        "category": new_task.category.id if new_task.category else None,
                        "description": new_task.description,
                        "price": str(new_task.price),
                        "location": new_task.location,
                        "scheduled_time": new_task.scheduled_time.isoformat(),
                        "status": new_task.status,
                        "safety_enabled": safety_enabled,
                        "geofence_lat": float(new_task.geofence_lat) if new_task.geofence_lat else None,
                        "geofence_lng": float(new_task.geofence_lng) if new_task.geofence_lng else None,
                        "geofence_radius": float(new_task.geofence_radius) if new_task.geofence_radius else None,
                    }
                })
            else:
                # Phản hồi hội thoại thông thường (không tạo task)
                clean_response = re.sub(r'<TASK_JSON>.*?</TASK_JSON>', '', ai_text, flags=re.DOTALL).strip()
                return Response({
                    "response": clean_response,
                    "type": "message"
                })

        except Exception as e:
            # Lỗi kết nối Gemini — trả về thân thiện
            error_msg = str(e)
            import logging
            logger = logging.getLogger('educarelink.chatbot')
            logger.error(f'[Chatbot] Gemini error: {error_msg}', exc_info=True)

            if 'API_KEY' in error_msg.upper() or 'INVALID' in error_msg.upper() or 'permission_denied' in error_msg.lower():
                detail = "API key Gemini không hợp lệ. Vui lòng kiểm tra lại trong file .env."
            elif 'QUOTA' in error_msg.upper() or 'RESOURCE_EXHAUSTED' in error_msg.upper():
                detail = "Đã hết hạn mức sử dụng Gemini miễn phí trong hôm nay. Thử lại vào ngày mai!"
            elif 'HIGH_DEMAND' in error_msg.upper() or 'UNAVAILABLE' in error_msg.upper() or '503' in error_msg.upper():
                detail = "Hệ thống AI đang quá tải (High Demand). Vui lòng thử lại sau vài giây!"
            elif 'deprecated' in error_msg.lower() or 'GeminiAllModelsDeprecated' in type(e).__name__:
                detail = (
                    "⚙️ Hệ thống AI đang bảo trì (Google đã cập nhật model). "
                    "Admin đang cập nhật — vui lòng thử lại sau ít phút."
                )
            elif 'NOT_FOUND' in error_msg.upper() or 'MODEL' in error_msg.upper():
                detail = (
                    "⚙️ Model AI đang được cập nhật. "
                    "Vui lòng thử lại sau ít phút hoặc liên hệ admin."
                )
            else:
                detail = f"Lỗi kết nối AI: {error_msg[:150]}"

            return Response({
                "response": f"❌ {detail}",
                "type": "error"
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)


# --- PHẦN 6: ADMIN QUẢN LÝ DUYỆT TÀI KHOẢN CAREPARTNER ---

class WorkerChatbotAPIView(APIView):
    """API Chatbot AI dành riêng cho Carepartner — hỗ trợ tư vấn việc làm, kỹ năng, v.v."""
    permission_classes = [IsAuthenticated]

    SYSTEM_PROMPT = """
Bạn là trợ lý AI của ứng dụng Educarelink — nền tảng kết nối phụ huynh với sinh viên/người chăm sóc (Carepartner).
Nhiệm vụ của bạn là giúp CAREPARTNER (người chăm sóc) giải đáp thắc mắc, tư vấn kỹ năng, và hỗ trợ trong quá trình làm việc.

BẠN CÓ THỂ HỖ TRỢ:
1. Tư vấn kỹ năng làm việc: cách chăm sóc trẻ, gia sư hiệu quả, giao tiếp với phụ huynh
2. Giải đáp thắc mắc về nền tảng: cách ứng tuyển, xem việc, cập nhật hồ sơ
3. Gợi ý cách tăng đánh giá sao và thu hút phụ huynh
4. Hỗ trợ viết mô tả bản thân ấn tượng
5. Tư vấn an toàn khi làm việc (đặc biệt với trẻ em)
6. Giải thích các quyền lợi và trách nhiệm của Carepartner

QUY TẮC:
- Luôn trả lời bằng TIẾNG VIỆT, thân thiện và chuyên nghiệp

QUY TẮC ĐỊNH DẠNG CÂU TRẢ LỜI (RẤT QUAN TRỌNG):
- KHÔNG viết 1 đoạn văn dài — RẤT KHÓ ĐỌC
- Mỗi ý xuống dòng riêng, dùng gạch đầu dòng "•" hoặc "-"
- Nhiều bước → đánh số 1. 2. 3.
- Giữa các phần → để 1 dòng trống
- Cung cấp câu trả lời chi tiết, có ví dụ thực tế khi có thể
- Không tạo task hay thực hiện hành động thay người dùng — chỉ tư vấn và hướng dẫn
- Nếu câu hỏi ngoài phạm vi, hãy lịch sự chuyển hướng về chủ đề liên quan
- Sử dụng ngữ cảnh cuộc hội thoại trước đó để hiểu ý người dùng
"""

    def _build_contents(self, user_message, chat_history=None):
        contents = []
        if chat_history and isinstance(chat_history, list):
            for msg in chat_history:
                role = msg.get('role', '')
                text = msg.get('text', '')
                if role in ('user', 'model') and text:
                    contents.append({'role': role, 'parts': [{'text': text}]})
        contents.append({'role': 'user', 'parts': [{'text': user_message}]})
        return contents

    def post(self, request):
        from django.conf import settings
        import json
        import re

        # Chỉ Carepartner mới được sử dụng chatbot này
        if request.user.role != 'worker':
            return Response({'error': 'Chỉ Carepartner mới được sử dụng tính năng này.'}, status=status.HTTP_403_FORBIDDEN)

        user_message = request.data.get('message', '').strip()
        chat_history = request.data.get('history', [])

        if not user_message:
            return Response({"error": "Tin nhắn không được trống."}, status=status.HTTP_400_BAD_REQUEST)

        gemini_key = getattr(settings, 'GEMINI_API_KEY', '')
        if not gemini_key or gemini_key == 'your_gemini_api_key_here':
            return Response({
                "response": "Tính năng AI chưa được kích hoạt. Vui lòng liên hệ admin để cấu hình.",
                "type": "info"
            })

        # Bổ sung ngữ cảnh người dùng vào system prompt
        user = request.user
        enriched_prompt = self.SYSTEM_PROMPT + f"""

THÔNG TIN NGƯỜI DÙNG HIỆN TẠI:
- Tên: {user.first_name} {user.last_name}
- Vai trò: Carepartner
- Đã xác thực: {'Có' if user.is_verified else 'Chưa'}
- Bằng cấp: {', '.join(user.qualifications) if isinstance(user.qualifications, list) and user.qualifications else 'Chưa cập nhật'}
"""

        try:
            from google import genai
            from performance.gemini_pool import get_pooled_gemini_client
            from performance.gemini_model import generate_content_with_fallback

            client = get_pooled_gemini_client()
            if client is None:
                client = genai.Client(api_key=gemini_key)

            contents = self._build_contents(user_message, chat_history)

            gemini_response, model_used = generate_content_with_fallback(
                client,
                contents=contents,
                system_instruction=enriched_prompt,
                temperature=0.8,
                max_output_tokens=2048,
            )
            ai_text = gemini_response.text
            if not ai_text:
                return Response({"response": "AI không thể trả lời do bộ lọc an toàn. Vui lòng thử câu hỏi khác.", "type": "error"}, status=status.HTTP_400_BAD_REQUEST)

            return Response({
                "response": ai_text,
                "type": "message"
            })

        except Exception as e:
            error_msg = str(e)
            if 'API_KEY' in error_msg.upper() or 'INVALID' in error_msg.upper():
                detail = "API key Gemini không hợp lệ."
            elif 'QUOTA' in error_msg.upper() or 'RESOURCE_EXHAUSTED' in error_msg.upper():
                detail = "Đã hết hạn mức sử dụng Gemini hôm nay. Thử lại vào ngày mai!"
            elif 'HIGH DEMAND' in error_msg.upper() or 'UNAVAILABLE' in error_msg.upper():
                detail = "Hệ thống AI đang quá tải. Vui lòng thử lại sau vài giây!"
            else:
                detail = f"Lỗi kết nối AI: {error_msg}"
            return Response({"response": detail, "type": "error"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

class HelpCenterAPIView(APIView):
    """API Trung tâm trợ giúp AI — trả lời câu hỏi về nền tảng EduCareLink"""
    permission_classes = [IsAuthenticated]

    SYSTEM_PROMPT = """
Bạn là trợ lý AI của Trung tâm trợ giúp EduCareLink — nền tảng kết nối phụ huynh với sinh viên/người chăm sóc (Carepartner).

NHIỆM VỤ: Giúp người dùng giải đáp mọi thắc mắc về cách sử dụng nền tảng EduCareLink.

HƯỚNG DẪN CHI TIẾT VỀ NỀN TẢNG:

**Đối với Phụ huynh:**
1. Đăng việc: Vào trang chủ → bấm nút "Đăng việc" hoặc dùng AI Chatbot để mô tả yêu cầu → AI tự động tạo việc
2. Tìm Carepartner: Đăng việc → chờ Carepartner ứng tuyển → duyệt ứng viên phù hợp
3. Quản lý việc: Xem danh sách việc đã đăng, cập nhật trạng thái (hoàn thành/hủy)
4. Đánh giá: Sau khi hoàn thành việc → vào "Việc của tôi" → đánh giá Carepartner
5. Chatbot AI: Bấm "AI Trợ lý" trên sidebar → mô tả yêu cầu bằng lời nói tự nhiên

**Đối với Carepartner:**
1. Tìm việc: Vào "Tìm việc" → duyệt danh sách → bấm "Ứng tuyển"
2. Việc của tôi: Xem danh sách việc đã ứng tuyển và trạng thái
3. Hồ sơ: Cập nhật thông tin cá nhân → gửi yêu cầu thay đổi (Admin sẽ duyệt)
4. Bằng cấp: Tải lên ảnh bằng cấp/chứng chỉ → Admin xem xét và đánh giá
5. Thông báo: Nhận thông báo từ Admin (duyệt hồ sơ, duyệt bằng cấp, v.v.)

**Quy trình đăng ký Carepartner:**
- Điền thông tin → Tải ảnh CCCD mặt trước + mặt sau + ảnh chân dung → Chờ Admin duyệt
- Sau khi được duyệt, có thể bắt đầu ứng tuyển việc

**Quy trình thay đổi hồ sơ:**
- Vào "Chỉnh sửa hồ sơ" → Sửa thông tin → Bấm "Lưu thay đổi" → Yêu cầu gửi đến Admin
- Admin sẽ duyệt hoặc từ chối → Nhận thông báo kết quả

**Quy trình gửi bằng cấp:**
- Vào "Bằng cấp của tôi" → Tải ảnh + mô tả → Gửi → Chờ Admin đánh giá
- Admin duyệt → Bằng cấp được cập nhật vào hồ sơ

QUY TẮC:
- Luôn trả lời bằng TIẾNG VIỆT, thân thiện, rõ ràng

QUY TẮC ĐỊNH DẠNG CÂU TRẢ LỜI (RẤT QUAN TRỌNG):
- KHÔNG viết 1 đoạn văn dài — RẤT KHÓ ĐỌC
- Mỗi ý xuống dòng riêng, dùng gạch đầu dòng "•" hoặc "-"
- Nhiều bước → đánh số 1. 2. 3.
- Giữa các phần → để 1 dòng trống
- Hướng dẫn từng bước khi giải thích tính năng
- Nếu câu hỏi không liên quan đến EduCareLink, lịch sự chuyển hướng
- Sử dụng ngữ cảnh cuộc hội thoại trước đó để hiểu ý người dùng
"""

    def _build_contents(self, user_message, chat_history=None):
        contents = []
        if chat_history and isinstance(chat_history, list):
            for msg in chat_history:
                role = msg.get('role', '')
                text = msg.get('text', '')
                if role in ('user', 'model') and text:
                    contents.append({'role': role, 'parts': [{'text': text}]})
        contents.append({'role': 'user', 'parts': [{'text': user_message}]})
        return contents

    def post(self, request):
        from django.conf import settings
        import json
        import re

        user_message = request.data.get('message', '').strip()
        chat_history = request.data.get('history', [])

        if not user_message:
            return Response({"error": "Tin nhắn không được trống."}, status=status.HTTP_400_BAD_REQUEST)

        gemini_key = getattr(settings, 'GEMINI_API_KEY', '')
        if not gemini_key or gemini_key == 'your_gemini_api_key_here':
            return Response({
                "response": "Tính năng AI chưa được kích hoạt. Vui lòng liên hệ admin.",
                "type": "info"
            })

        # Bổ sung ngữ cảnh người dùng
        user = request.user
        role_display = 'Phụ huynh' if user.role == 'parent' else 'Carepartner'
        enriched_prompt = self.SYSTEM_PROMPT + f"""

THÔNG TIN NGƯỜI DÙNG HIỆN TẠI:
- Tên: {user.first_name} {user.last_name}
- Vai trò: {role_display}
- Đã xác thực: {'Có' if user.is_verified else 'Chưa'}
- Tài khoản đã duyệt: {'Có' if user.is_approved else 'Chưa'}
"""

        try:
            from google import genai
            from performance.gemini_pool import get_pooled_gemini_client
            from performance.gemini_model import generate_content_with_fallback

            client = get_pooled_gemini_client()
            if client is None:
                client = genai.Client(api_key=gemini_key)

            contents = self._build_contents(user_message, chat_history)

            gemini_response, model_used = generate_content_with_fallback(
                client,
                contents=contents,
                system_instruction=enriched_prompt,
                temperature=0.7,
                max_output_tokens=2048,
            )
            ai_text = gemini_response.text
            if not ai_text:
                return Response({"response": "AI không thể trả lời do bộ lọc an toàn. Vui lòng thử câu hỏi khác.", "type": "error"}, status=status.HTTP_400_BAD_REQUEST)

            return Response({
                "response": ai_text,
                "type": "message"
            })

        except Exception as e:
            error_msg = str(e)
            if 'API_KEY' in error_msg.upper() or 'INVALID' in error_msg.upper():
                detail = "API key Gemini không hợp lệ."
            elif 'QUOTA' in error_msg.upper() or 'RESOURCE_EXHAUSTED' in error_msg.upper():
                detail = "Đã hết hạn mức sử dụng AI hôm nay. Thử lại vào ngày mai!"
            elif 'HIGH DEMAND' in error_msg.upper() or 'UNAVAILABLE' in error_msg.upper():
                detail = "Hệ thống AI đang quá tải. Vui lòng thử lại sau vài giây!"
            else:
                detail = f"Lỗi kết nối AI: {error_msg}"
            return Response({"response": detail, "type": "error"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


# ===== DISTANCE CALCULATION API =====
import math as math_module

class DistanceCalculationAPIView(APIView):
    """Tính khoảng cách giữa 2 người dùng hoặc giữa người dùng và công việc.
    Sử dụng Haversine cho khoảng cách chính xác + Gemini AI để ước tính thời gian di chuyển."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        lat1 = request.data.get('lat1')
        lon1 = request.data.get('lon1')
        lat2 = request.data.get('lat2')
        lon2 = request.data.get('lon2')

        # Hoặc truyền user_id / task_id để tự lấy tọa độ
        user_id = request.data.get('user_id')
        task_id = request.data.get('task_id')

        # Lấy tọa độ từ user_id
        if user_id and (lat2 is None or lon2 is None):
            try:
                target_user = User.objects.get(id=user_id)
                if target_user.latitude is not None and target_user.longitude is not None:
                    lat2 = target_user.latitude
                    lon2 = target_user.longitude
                else:
                    return Response({"error": "Người dùng này chưa cập nhật vị trí trên bản đồ."}, status=status.HTTP_400_BAD_REQUEST)
            except User.DoesNotExist:
                return Response({"error": "Không tìm thấy người dùng."}, status=status.HTTP_404_NOT_FOUND)

        # Lấy tọa độ từ task_id
        if task_id and (lat2 is None or lon2 is None):
            try:
                task = Task.objects.get(id=task_id)
                if task.latitude is not None and task.longitude is not None:
                    lat2 = task.latitude
                    lon2 = task.longitude
                else:
                    return Response({"error": "Công việc này chưa có vị trí trên bản đồ."}, status=status.HTTP_400_BAD_REQUEST)
            except Task.DoesNotExist:
                return Response({"error": "Không tìm thấy công việc."}, status=status.HTTP_404_NOT_FOUND)

        # Nếu không có lat1/lon1, dùng vị trí của người dùng hiện tại
        if lat1 is None or lon1 is None:
            if request.user.latitude is not None and request.user.longitude is not None:
                lat1 = request.user.latitude
                lon1 = request.user.longitude
            else:
                return Response({"error": "Bạn chưa cập nhật vị trí trên bản đồ. Vui lòng chọn vị trí trong hồ sơ."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            lat1 = float(lat1)
            lon1 = float(lon1)
            lat2 = float(lat2)
            lon2 = float(lon2)
        except (TypeError, ValueError):
            return Response({"error": "Tọa độ không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)

        # Tính khoảng cách bằng Haversine
        distance_km = haversine_distance(lat1, lon1, lat2, lon2)

        # Dùng Gemini AI để ước tính thời gian di chuyển
        travel_info = None
        gemini_key = os.environ.get('GEMINI_API_KEY', '')
        if gemini_key:
            try:
                from google import genai
                from performance.gemini_pool import get_pooled_gemini_client
                from performance.gemini_model import generate_content_with_fallback

                client = get_pooled_gemini_client()
                if client is None:
                    client = genai.Client(api_key=gemini_key)

                prompt = (
                    f"Hai địa điểm có tọa độ ({lat1}, {lon1}) và ({lat2}, {lon2}), "
                    f"khoảng cách đường chim bay là {distance_km} km. "
                    f"Đây là Việt Nam. Hãy ước tính thời gian di chuyển thực tế bằng xe máy "
                    f"(phương tiện phổ biến nhất ở Việt Nam) và bằng ô tô. "
                    f"Chỉ trả lời ngắn gọn theo format: 'Xe máy: ~X phút, Ô tô: ~Y phút'. "
                    f"Không thêm giải thích."
                )
                gemini_response, _ = generate_content_with_fallback(
                    client,
                    contents=prompt,
                    temperature=0.3,
                    max_output_tokens=128,
                )
                travel_info = gemini_response.text.strip()
            except Exception:
                travel_info = None

        result = {
            "distance_km": distance_km,
            "lat1": lat1, "lon1": lon1,
            "lat2": lat2, "lon2": lon2,
        }
        if travel_info:
            result["travel_info"] = travel_info

        return Response(result)


# ===== ADMIN AI CHATBOT — THỐNG KÊ, PHÁT HIỆN BẤT THƯỜNG, HÀNH ĐỘNG, PHÂN TÍCH ẢNH =====

import base64 as _base64

class AdminChatbotAPIView(APIView):
    """API Chatbot AI dành riêng cho Admin — thống kê, phát hiện bất thường, hành động, phân tích ảnh bằng cấp."""
    permission_classes = [IsAdminUser]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    SYSTEM_PROMPT = """Bạn là AI Trợ lý Quản trị của nền tảng EduCareLink — hệ thống kết nối phụ huynh với sinh viên/người chăm sóc (Carepartner).

KHẢ NĂNG CỦA BẠN:
1. **Thống kê & Tổng hợp**: Cung cấp số liệu tổng quan, xu hướng, báo cáo về nền tảng.
2. **Phát hiện bất thường**: Cảnh báo tài khoản đáng ngờ, đánh giá thấp, việc không ai nhận, v.v.
3. **Hành động tài khoản**: Khi admin yêu cầu, bạn có thể gợi ý lệnh để:
   - Khóa tài khoản: "cấm user <ID>" hoặc "khóa user <ID>"
   - Mở khóa: "mở user <ID>" hoặc "mở khóa user <ID>"
   - Duyệt Carepartner: "duyệt user <ID>"
   - Từ chối: "từ chối user <ID>"
4. **Phân tích hình ảnh bằng cấp**: Khi admin gửi ảnh bằng cấp/chứng chỉ, bạn đọc nội dung, đánh giá tính hợp lệ, và gợi ý cách viết đánh giá cho admin.
5. **Viết thông báo**: Soạn thông báo chuyên nghiệp cho Carepartner.
6. **Tư vấn cải tiến**: Đề xuất cách tối ưu quy trình duyệt, quản lý, vận hành nền tảng.

QUY TẮC:
- Luôn trả lời bằng TIẾNG VIỆT, chuyên nghiệp, rõ ràng, có cấu trúc.

QUY TẮC ĐỊNH DẠNG CÂU TRẢ LỜI (RẤT QUAN TRỌNG):
- KHÔNG viết 1 đoạn văn dài — RẤT KHÓ ĐỌC
- Mỗi ý xuống dòng riêng, dùng gạch đầu dòng "•" hoặc "-"
- Nhiều bước → đánh số 1. 2. 3.
- Giữa các phần → để 1 dòng trống
- Khi admin yêu cầu hành động (cấm, duyệt, mở khóa...), bạn phải XÁC NHẬN lại trước: "Bạn có chắc muốn <hành động> với tài khoản <tên> (ID: <id>) không?"
- Sau khi admin xác nhận, thực hiện hành động và báo kết quả.
- Khi phân tích ảnh bằng cấp, hãy mô tả chi tiết nội dung, đánh giá mức độ hợp lệ, và gợi ý mẫu đánh giá cho admin (admin có thể dùng hoặc không).
- Nếu không đủ thông tin, hãy yêu cầu admin cung cấp thêm.
- KHÔNG tự ý thực hiện hành động nếu admin chưa xác nhận.
"""

    def _build_contents(self, user_message, chat_history=None):
        contents = []
        if chat_history and isinstance(chat_history, list):
            for msg in chat_history:
                role = msg.get('role', '')
                text = msg.get('text', '')
                if role in ('user', 'model') and text:
                    contents.append({'role': role, 'parts': [{'text': text}]})
        contents.append({'role': 'user', 'parts': [{'text': user_message}]})
        return contents

    def _build_contents_with_image(self, user_message, image_base64, mime_type, chat_history=None):
        """Xây dựng nội dung cho Gemini kèm hình ảnh (dùng cho phân tích bằng cấp)."""
        contents = []
        if chat_history and isinstance(chat_history, list):
            for msg in chat_history:
                role = msg.get('role', '')
                text = msg.get('text', '')
                if role in ('user', 'model') and text:
                    contents.append({'role': role, 'parts': [{'text': text}]})

        image_part = {
            'inline_data': {
                'mime_type': mime_type,
                'data': image_base64
            }
        }
        contents.append({
            'role': 'user',
            'parts': [
                {'text': user_message},
                image_part
            ]
        })
        return contents

    def post(self, request):
        from django.conf import settings
        import json
        import re

        user_message = request.data.get('message', '').strip()
        chat_history = request.data.get('history', [])
        image_file = request.FILES.get('image')

        if not user_message and not image_file:
            return Response({"error": "Tin nhắn hoặc hình ảnh không được trống."}, status=status.HTTP_400_BAD_REQUEST)

        gemini_key = getattr(settings, 'GEMINI_API_KEY', '')
        if not gemini_key or gemini_key == 'your_gemini_api_key_here':
            return Response({
                "response": "Tính năng AI chưa được kích hoạt. Vui lòng cấu hình GEMINI_API_KEY.",
                "type": "info"
            })

        # Bước 1: Kiểm tra xem có phải lệnh hành động không
        if user_message:
            action_success, action_msg = _execute_admin_action(user_message)
            if action_success is not None:
                # Đây là lệnh hành động, trả về kết quả ngay
                return Response({
                    "response": action_msg,
                    "type": "action_result"
                })

        # Bước 2: Lấy ngữ cảnh thống kê nền tảng
        stats_context = _get_platform_stats()

        # Bước 3: Nếu admin nhắn "thống kê" hoặc "tình hình" → trả về thống kê trực tiếp
        if user_message and any(kw in user_message.lower() for kw in ['thống kê', 'tình hình', 'số liệu', 'bao nhiêu', 'tổng quan', 'overview', 'stats']):
            enriched_prompt = self.SYSTEM_PROMPT + f"""

{stats_context}

Hãy dựa trên số liệu thực tế ở trên để trả lời admin. Phân tích và đưa ra nhận xét, lời khuyên cụ thể."""
        else:
            enriched_prompt = self.SYSTEM_PROMPT + f"""

NGỮ CẢNH NỀN TẢNG HIỆN TẠI:
{stats_context}

Hãy sử dụng thông tin này khi cần để trả lời admin."""

        try:
            from google import genai
            from performance.gemini_pool import get_pooled_gemini_client
            from performance.gemini_model import generate_content_with_fallback

            client = get_pooled_gemini_client()
            if client is None:
                client = genai.Client(api_key=gemini_key)

            # Nếu có ảnh bằng cấp → dùng Gemini Vision
            if image_file:
                image_data = image_file.read()
                image_b64 = _base64.b64encode(image_data).decode('utf-8')
                mime_type = image_file.content_type or 'image/jpeg'

                analysis_prompt = user_message or "Hãy phân tích ảnh bằng cấp/chứng chỉ này. Mô tả chi tiết nội dung, loại bằng cấp, trường/cơ sở cấp, ngày cấp, và bất kỳ thông tin nào có thể đọc được. Sau đó đánh giá mức độ hợp lệ và gợi ý cách viết đánh giá cho admin."

                contents = self._build_contents_with_image(
                    analysis_prompt, image_b64, mime_type, chat_history
                )

                gemini_response, _ = generate_content_with_fallback(
                    client,
                    contents=contents,
                    system_instruction=enriched_prompt,
                    temperature=0.5,
                    max_output_tokens=3000,
                )
            else:
                # Chat thông thường
                contents = self._build_contents(user_message, chat_history)
                gemini_response, _ = generate_content_with_fallback(
                    client,
                    contents=contents,
                    system_instruction=enriched_prompt,
                    temperature=0.7,
                    max_output_tokens=2048,
                )

            ai_text = gemini_response.text
            if not ai_text:
                return Response({"response": "AI không thể trả lời do bộ lọc an toàn. Vui lòng thử câu hỏi khác.", "type": "error"}, status=status.HTTP_400_BAD_REQUEST)

            response_type = "message"
            if image_file:
                response_type = "image_analysis"
            elif any(kw in user_message.lower() for kw in ['thống kê', 'tình hình', 'số liệu', 'bao nhiêu', 'tổng quan']):
                response_type = "statistics"

            return Response({
                "response": ai_text,
                "type": response_type
            })

        except Exception as e:
            error_msg = str(e)
            if 'API_KEY' in error_msg.upper() or 'INVALID' in error_msg.upper():
                detail = "API key Gemini không hợp lệ."
            elif 'QUOTA' in error_msg.upper() or 'RESOURCE_EXHAUSTED' in error_msg.upper():
                detail = "Đã hết hạn mức sử dụng Gemini hôm nay. Thử lại vào ngày mai!"
            elif 'HIGH DEMAND' in error_msg.upper() or 'UNAVAILABLE' in error_msg.upper():
                detail = "Hệ thống AI đang quá tải. Vui lòng thử lại sau vài giây!"
            else:
                detail = f"Lỗi kết nối AI: {error_msg}"
            return Response({"response": detail, "type": "error"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
