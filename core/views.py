from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from .models import User, Task, TaskApplication, ServiceCategory, Review
from .serializers import (
    UserSerializer, TaskSerializer, TaskApplicationSerializer, 
    ServiceCategorySerializer, ReviewSerializer
)

def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {'refresh': str(refresh), 'access': str(refresh.access_token)}

# --- PHẦN 1: TÀI KHOẢN (ONBOARDING) ---
class RegisterAPIView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]

class LoginAPIView(APIView):
    permission_classes = [AllowAny]
    def post(self, request):
        user = authenticate(username=request.data.get('username'), password=request.data.get('password'))
        if user:
            return Response({
                "message": "Đăng nhập thành công!",
                "tokens": get_tokens_for_user(user),
                "user_id": user.id, "username": user.username, "role": user.role
            }, status=status.HTTP_200_OK)
        return Response({"error": "Sai tài khoản hoặc mật khẩu"}, status=status.HTTP_401_UNAUTHORIZED)

class UserProfileAPIView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data) # Phục vụ Màn hình 11: Hồ sơ

# --- PHẦN 2: CHUNG CHO CẢ PHỤ HUYNH & SINH VIÊN ---
class TaskListCreateAPIView(generics.ListCreateAPIView):
    queryset = Task.objects.all().order_by('-created_at')
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]
    
    def perform_create(self, serializer):
        serializer.save(parent=self.request.user) # Phục vụ Màn 4: Phụ huynh đăng việc

# --- PHẦN 3: LUỒNG DÀNH CHO PHỤ HUYNH ---
class ParentTasksAPIView(generics.ListAPIView):
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]
    def get_queryset(self):
         # Phục vụ Màn 5: Lấy danh sách việc phụ huynh đã đăng
         return Task.objects.filter(parent=self.request.user).order_by('-created_at')

class TaskCandidatesAPIView(generics.ListAPIView):
    serializer_class = TaskApplicationSerializer
    permission_classes = [IsAuthenticated]
    def get_queryset(self):
        # Phục vụ Màn 6: Phụ huynh xem ai đã ứng tuyển vào việc của mình
        return TaskApplication.objects.filter(task_id=self.kwargs['task_id'], task__parent=self.request.user)

class ApproveCandidateAPIView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request, application_id):
        # Phục vụ Màn 6: Nút bấm [Chấp nhận bạn này]
        try:
            application = TaskApplication.objects.get(id=application_id, task__parent=request.user)
            if application.task.status != 'open':
                return Response({"error": "Công việc này đã đóng hoặc đang làm."}, status=status.HTTP_400_BAD_REQUEST)
            
            application.status = 'accepted'
            application.save()
            
            task = application.task
            task.status = 'in_progress'
            task.save()
            
            # Tự động từ chối các bạn khác
            TaskApplication.objects.filter(task=task, status='pending').update(status='rejected')
            return Response({"message": f"Đã nhận {application.worker.username} làm việc!"})
        except TaskApplication.DoesNotExist:
            return Response({"error": "Không tìm thấy yêu cầu."}, status=status.HTTP_404_NOT_FOUND)

class ReviewCreateAPIView(generics.CreateAPIView):
    queryset = Review.objects.all()
    serializer_class = ReviewSerializer
    permission_classes = [IsAuthenticated]
    def perform_create(self, serializer):
        # Phục vụ Màn 7: Đánh giá
        serializer.save(reviewer=self.request.user)

# --- PHẦN 4: LUỒNG DÀNH CHO SINH VIÊN ---
class ApplyTaskAPIView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request, task_id):
        # Phục vụ Màn 9: Nút bấm [Ứng tuyển ngay]
        if request.user.role != 'worker':
            return Response({"error": "Chỉ Carepartner mới được nhận việc!"}, status=status.HTTP_403_FORBIDDEN)
        try:
            task = Task.objects.get(id=task_id)
            if task.parent == request.user:
                 return Response({"error": "Không thể tự nhận việc của mình."}, status=400)

            app, created = TaskApplication.objects.get_or_create(task=task, worker=request.user, defaults={'status': 'pending'})
            if created: return Response({"message": "Đã ứng tuyển!"}, status=201)
            return Response({"message": "Bạn đã ứng tuyển rồi!"}, status=400)
        except Task.DoesNotExist:
            return Response({"error": "Không tìm thấy công việc."}, status=404)

class WorkerJobsAPIView(generics.ListAPIView):
    serializer_class = TaskApplicationSerializer
    permission_classes = [IsAuthenticated]
    def get_queryset(self):
        # Phục vụ Màn 10: Việc của tôi (Sinh viên)
        return TaskApplication.objects.filter(worker=self.request.user).order_by('-applied_at')

# --- PHẦN 5: CHATBOT AI (Tích hợp Google Gemini) ---
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

QUY TẮC XỬ LÝ:
- Nếu người dùng muốn ĐĂNG VIỆC hoặc TÌM NGƯỜI: phân tích và trả về JSON trong thẻ <TASK_JSON>...</TASK_JSON>
- Nếu thiếu thông tin bắt buộc (địa điểm, thời gian, giá): hỏi lại một cách thân thiện
- Nếu chỉ hỏi thông tin thông thường: trả lời bình thường, KHÔNG tạo JSON
- Luôn trả lời bằng TIẾNG VIỆT, thân thiện và ngắn gọn

FORMAT JSON khi tạo task (bắt buộc đủ các field):
<TASK_JSON>
{
  "category": <số 1-5>,
  "title": "<tiêu đề ngắn gọn>",
  "description": "<mô tả chi tiết yêu cầu>",
  "location": "<địa điểm cụ thể>",
  "scheduled_time": "<YYYY-MM-DDTHH:MM:00+07:00>",
  "price": <số tiền VND, không có dấu chấm>
}
</TASK_JSON>

Ví dụ: Nếu người dùng nói "Tôi cần gia sư Toán lớp 8 vào tối thứ 3 tuần này ở Quận 1, trả 200k/buổi"
→ Trả lời xác nhận lại thông tin + JSON hợp lệ bên trong thẻ <TASK_JSON>.
"""

    def post(self, request):
        from django.conf import settings
        import json
        import re

        user_message = request.data.get('message', '').strip()
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

            client = genai.Client(api_key=gemini_key)

            # Gọi Gemini với system prompt + tin nhắn người dùng
            full_prompt = f"{self.SYSTEM_PROMPT}\n\nNgười dùng: {user_message}"
            gemini_response = client.models.generate_content(
                model='gemini-2.0-flash',
                contents=full_prompt
            )
            ai_text = gemini_response.text

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

                new_task = Task.objects.create(
                    parent=request.user,
                    category=category,
                    title=task_data['title'],
                    description=task_data['description'],
                    location=task_data['location'],
                    scheduled_time=scheduled,
                    price=int(task_data['price']),
                    status='open',
                    ai_generated_from_prompt=user_message,  # Lưu lại câu chat gốc
                )

                # Trả về phản hồi sạch (không có JSON thô) + thông tin task đã tạo
                clean_response = re.sub(r'<TASK_JSON>.*?</TASK_JSON>', '', ai_text, flags=re.DOTALL).strip()
                return Response({
                    "response": clean_response + f"\n\n✅ Đã tạo công việc thành công!",
                    "type": "task_created",
                    "task": {
                        "id": new_task.id,
                        "title": new_task.title,
                        "price": str(new_task.price),
                        "location": new_task.location,
                        "scheduled_time": new_task.scheduled_time.isoformat(),
                        "status": new_task.status,
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
            if 'API_KEY' in error_msg.upper() or 'INVALID' in error_msg.upper():
                detail = "API key Gemini không hợp lệ. Vui lòng kiểm tra lại trong file .env."
            elif 'QUOTA' in error_msg.upper():
                detail = "Đã hết hạn mức sử dụng Gemini miễn phí trong hôm nay. Thử lại vào ngày mai!"
            else:
                detail = f"Lỗi kết nối AI: {error_msg}"

            return Response({
                "response": f"❌ {detail}",
                "type": "error"
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)