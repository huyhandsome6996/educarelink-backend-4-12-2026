from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
import os
import requests
from .models import User, Task, TaskApplication, ServiceCategory, Review


def build_absolute_uri(request, url):
    """Tạo URL tuyệt đối, đảm bảo dùng HTTPS trên Render."""
    if not url:
        return None
    abs_url = request.build_absolute_uri(url)
    # Fix: trên Render, request.build_absolute_uri() sinh ra http:// thay vì https://
    if os.environ.get('RENDER', '') == 'true':
        abs_url = abs_url.replace('http://', 'https://', 1)
    return abs_url

from .serializers import (
    UserSerializer, TaskSerializer, TaskApplicationSerializer, 
    ServiceCategorySerializer, ReviewSerializer
)

def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {'refresh': str(refresh), 'access': str(refresh.access_token)}

def send_expo_push_notification(token, title, body, data=None):
    if not token:
        return
    headers = {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
    }
    payload = {
        'to': token,
        'sound': 'default',
        'title': title,
        'body': body,
        'data': data or {},
    }
    try:
        requests.post('https://exp.host/--/api/v2/push/send', headers=headers, json=payload, timeout=5)
    except Exception as e:
        print(f"Lỗi gửi thông báo push: {e}")

# --- PHẦN 1: TÀI KHOẢN (ONBOARDING) ---
class RegisterAPIView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def create(self, request, *args, **kwargs):
        role = request.data.get('role', 'parent')
        
        # Validate phụ huynh: bắt buộc email + phone
        if role == 'parent':
            email = request.data.get('email', '').strip()
            phone = request.data.get('phone_number', '').strip()
            if not email:
                return Response({'email': ['Phụ huynh phải cung cấp email.']}, status=status.HTTP_400_BAD_REQUEST)
            if not phone:
                return Response({'phone_number': ['Phụ huynh phải cung cấp số điện thoại.']}, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate carepartner: bắt buộc ảnh CCCD + selfie + email + phone
        if role == 'worker':
            email = request.data.get('email', '').strip()
            phone = request.data.get('phone_number', '').strip()
            if not email:
                return Response({'email': ['Carepartner phải cung cấp email.']}, status=status.HTTP_400_BAD_REQUEST)
            if not phone:
                return Response({'phone_number': ['Carepartner phải cung cấp số điện thoại.']}, status=status.HTTP_400_BAD_REQUEST)
            if not request.FILES.get('id_card_front'):
                return Response({'id_card_front': ['Ảnh mặt trước CCCD là bắt buộc.']}, status=status.HTTP_400_BAD_REQUEST)
            if not request.FILES.get('id_card_back'):
                return Response({'id_card_back': ['Ảnh mặt sau CCCD là bắt buộc.']}, status=status.HTTP_400_BAD_REQUEST)
            if not request.FILES.get('selfie_photo'):
                return Response({'selfie_photo': ['Ảnh chân dung là bắt buộc.']}, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save(role=role)
        
        # Đặt is_approved theo role (role='read_only' trong serializer nên phải set qua save())
        if role == 'parent':
            user.is_approved = True
        else:
            user.is_approved = False
        user.save()
        
        if role == 'worker':
            return Response({
                'message': 'Đăng ký thành công! Tài khoản của bạn đang chờ Admin xét duyệt. Vui lòng đợi thông báo.',
                'status': 'pending_approval'
            }, status=status.HTTP_201_CREATED)
        else:
            return Response({
                'message': 'Đăng ký thành công!',
                'status': 'approved'
            }, status=status.HTTP_201_CREATED)

class LoginAPIView(APIView):
    permission_classes = [AllowAny]
    def post(self, request):
        user = authenticate(username=request.data.get('username'), password=request.data.get('password'))
        if user:
            # Carepartner phải được admin duyệt mới đăng nhập được
            if user.role == 'worker' and not user.is_approved:
                return Response({
                    "error": "Tài khoản của bạn đang chờ Admin xét duyệt. Vui lòng đợi.",
                    "status": "pending_approval"
                }, status=status.HTTP_403_FORBIDDEN)
            return Response({
                "message": "Đăng nhập thành công!",
                "tokens": get_tokens_for_user(user),
                "user_id": user.id, "username": user.username, "role": user.role,
                "is_staff": user.is_staff,
                "is_approved": user.is_approved,
                "first_name": user.first_name,
                "last_name": user.last_name,
            }, status=status.HTTP_200_OK)
        return Response({"error": "Sai tài khoản hoặc mật khẩu"}, status=status.HTTP_401_UNAUTHORIZED)

class UserProfileAPIView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    
    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data) # Phục vụ Màn hình 11: Hồ sơ

    def patch(self, request):
        # Ngăn chặn role escalation — loại role, is_staff, is_superuser khỏi data
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        for forbidden_field in ['role', 'is_staff', 'is_superuser', 'is_approved', 'is_verified']:
            data.pop(forbidden_field, None)
        
        # Nếu có password mới → hash đúng cách
        password = data.pop('password', None)
        
        serializer = UserSerializer(request.user, data=data, partial=True)
        if serializer.is_valid():
            user = serializer.save()
            # Hash mật khẩu mới nếu có
            if password:
                user.set_password(password)
                user.save()
            return Response(UserSerializer(user).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# --- PHẦN 2: CHUNG CHO CẢ PHỤ HUYNH & SINH VIÊN ---
class TaskListCreateAPIView(generics.ListCreateAPIView):
    queryset = Task.objects.all().order_by('-created_at')
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]
    
    def perform_create(self, serializer):
        serializer.save(parent=self.request.user) # Phục vụ Màn 4: Phụ huynh đăng việc


class TaskDetailAPIView(generics.RetrieveAPIView):
    """API lấy chi tiết 1 công việc theo ID — tránh fetch ALL tasks rồi filter client-side"""
    queryset = Task.objects.all()
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]


class TaskUpdateStatusAPIView(APIView):
    """API cho phụ huynh cập nhật trạng thái công việc (hoàn thành / hủy)"""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            task = Task.objects.get(pk=pk)
        except Task.DoesNotExist:
            return Response({"error": "Không tìm thấy công việc."}, status=status.HTTP_404_NOT_FOUND)

        # Chỉ phụ huynh sở hữu công việc mới được thay đổi trạng thái
        if task.parent != request.user:
            return Response({"error": "Bạn không có quyền thay đổi công việc này."}, status=status.HTTP_403_FORBIDDEN)

        new_status = request.data.get('status')
        valid_transitions = {
            'open': ['cancelled'],           # Việc đang tìm → chỉ có thể hủy
            'in_progress': ['completed', 'cancelled'],  # Việc đang làm → hoàn thành hoặc hủy
        }

        if new_status not in ['completed', 'cancelled']:
            return Response({"error": "Trạng thái không hợp lệ. Chỉ chấp nhận 'completed' hoặc 'cancelled'."}, status=status.HTTP_400_BAD_REQUEST)

        allowed = valid_transitions.get(task.status, [])
        if new_status not in allowed:
            return Response({"error": f"Không thể chuyển từ '{task.status}' sang '{new_status}'."}, status=status.HTTP_400_BAD_REQUEST)

        task.status = new_status
        task.save()
        serializer = TaskSerializer(task)
        return Response(serializer.data)

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
            
            # Gửi push notification cho ứng viên được nhận
            if hasattr(application.worker, 'expo_push_token') and application.worker.expo_push_token:
                send_expo_push_notification(
                    token=application.worker.expo_push_token,
                    title="🎉 Chúc mừng bạn!",
                    body=f"Phụ huynh đã chấp nhận bạn cho công việc '{task.title}'. Hãy mở ứng dụng để xem chi tiết!",
                    data={"task_id": task.id}
                )

            return Response({"message": f"Đã nhận {application.worker.username} làm việc!"})
        except TaskApplication.DoesNotExist:
            return Response({"error": "Không tìm thấy yêu cầu."}, status=status.HTTP_404_NOT_FOUND)

class ReviewCreateAPIView(generics.CreateAPIView):
    queryset = Review.objects.all()
    serializer_class = ReviewSerializer
    permission_classes = [IsAuthenticated]
    def perform_create(self, serializer):
        # Phục vụ Màn 7: Đánh giá
        task_id = self.request.data.get('task')
        # Validate: chỉ review task đã hoàn thành
        if task_id:
            try:
                task = Task.objects.get(id=task_id)
                if task.status != 'completed':
                    raise serializers.ValidationError({'task': 'Chỉ đánh giá công việc đã hoàn thành.'})
                if task.parent != self.request.user:
                    raise serializers.ValidationError({'task': 'Bạn chỉ được đánh giá công việc của mình.'})
                # Kiểm tra đã review chưa
                if hasattr(task, 'review'):
                    raise serializers.ValidationError({'task': 'Công việc này đã được đánh giá.'})
                # Tự động xác định reviewee là worker được accept
                accepted_app = TaskApplication.objects.filter(task=task, status='accepted').first()
                if accepted_app:
                    serializer.save(reviewer=self.request.user, reviewee=accepted_app.worker)
                else:
                    serializer.save(reviewer=self.request.user)
            except Task.DoesNotExist:
                raise serializers.ValidationError({'task': 'Không tìm thấy công việc.'})
        else:
            serializer.save(reviewer=self.request.user)

# --- PHẦN 4: LUỒNG DÀNH CHO SINH VIÊN ---
class ApplyTaskAPIView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request, task_id):
        # Phục vụ Màn 9: Nút bấm [Ứng tuyển ngay]
        if request.user.role != 'worker':
            return Response({"error": "Chỉ Carepartner mới được nhận việc!"}, status=status.HTTP_403_FORBIDDEN)
        if not request.user.is_approved:
            return Response({"error": "Tài khoản của bạn chưa được Admin duyệt. Vui lòng đợi."}, status=status.HTTP_403_FORBIDDEN)
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

class WorkerProfileDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, worker_id):
        try:
            worker = User.objects.get(id=worker_id, role='worker')
            # Lấy tất cả đánh giá mà sinh viên này nhận được
            reviews = Review.objects.filter(reviewee=worker).order_by('-created_at')
            
            # Tính toán số sao trung bình
            avg_rating = 0.0
            if reviews.exists():
                avg_rating = sum([r.rating for r in reviews]) / reviews.count()
            
            # Bằng cấp/chứng chỉ lấy từ database (admin đã duyệt/nhập)
            qualifications = worker.qualifications if isinstance(worker.qualifications, list) else []

            # Serialize reviews
            serialized_reviews = []
            for r in reviews:
                serialized_reviews.append({
                    "id": r.id,
                    "rating": r.rating,
                    "comment": r.comment,
                    "reviewer_username": r.reviewer.username,
                    "reviewer_name": f"{r.reviewer.first_name} {r.reviewer.last_name}".strip() or r.reviewer.username,
                    "created_at": r.created_at.strftime('%d/%m/%Y')
                })

            data = {
                "id": worker.id,
                "username": worker.username,
                "first_name": worker.first_name,
                "last_name": worker.last_name,
                "is_verified": worker.is_verified,
                "ai_profile_summary": worker.ai_profile_summary or "Chưa có nhận xét từ AI.",
                "avg_rating": round(avg_rating, 1) if reviews.exists() else 0.0,
                "review_count": reviews.count(),
                "qualifications": qualifications,
                "reviews": serialized_reviews
            }
            return Response(data, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({"error": "Không tìm thấy hồ sơ Carepartner."}, status=status.HTTP_404_NOT_FOUND)

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
6 = Nấu ăn (nấu bữa cho gia đình)
7 = Hỗ trợ AI (công nghệ AI hỗ trợ học tập)
8 = Khác (chuyển đồ, thú cưng, kỹ năng sống, v.v.)

QUY TẮC XỬ LÝ:
- Nếu người dùng muốn ĐĂNG VIỆC hoặc TÌM NGƯỜI: phân tích và trả về JSON trong thẻ <TASK_JSON>...</TASK_JSON>
- Nếu thiếu thông tin bắt buộc (địa điểm, thời gian, giá): hỏi lại một cách thân thiện
- Nếu chỉ hỏi thông tin thông thường: trả lời bình thường, KHÔNG tạo JSON
- Luôn trả lời bằng TIẾNG VIỆT, thân thiện và ngắn gọn
- Sử dụng ngữ cảnh cuộc hội thoại trước đó để hiểu ý người dùng, tránh hỏi lại thông tin đã cung cấp

FORMAT JSON khi tạo task (bắt buộc đủ các field):
<TASK_JSON>
{
  "category": <số 1-8>,
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

            client = genai.Client(api_key=gemini_key)

            # Xây dựng nội dung với lịch sử hội thoại
            contents = self._build_contents(user_message, chat_history)

            gemini_response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=contents,
                config=genai.types.GenerateContentConfig(
                    system_instruction=self.SYSTEM_PROMPT,
                    temperature=0.7,
                    max_output_tokens=2048,
                )
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
                        "category": new_task.category.id if new_task.category else None,
                        "description": new_task.description,
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
            elif 'QUOTA' in error_msg.upper() or 'RESOURCE_EXHAUSTED' in error_msg.upper():
                detail = "Đã hết hạn mức sử dụng Gemini miễn phí trong hôm nay. Thử lại vào ngày mai!"
            elif 'HIGH DEMAND' in error_msg.upper() or 'UNAVAILABLE' in error_msg.upper() or '503' in error_msg.upper():
                detail = "Hệ thống AI đang quá tải (High Demand). Vui lòng thử lại sau vài giây!"
            elif 'MODEL' in error_msg.upper() or 'NOT_FOUND' in error_msg.upper():
                detail = f"Model AI không khả dụng. Vui lòng liên hệ admin để cập nhật model."
            else:
                detail = f"Lỗi kết nối AI: {error_msg}"

            return Response({
                "response": f"❌ {detail}",
                "type": "error"
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)


# --- PHẦN 6: ADMIN QUẢN LÝ DUYỆT TÀI KHOẢN CAREPARTNER ---
class AdminPendingWorkersAPIView(APIView):
    """API lấy danh sách Carepartner chờ duyệt (dành cho trang Admin)"""
    permission_classes = [IsAdminUser]  # Yêu cầu quyền admin (is_staff=True)

    def get(self, request):
        pending = User.objects.filter(role='worker', is_approved=False).order_by('-date_joined')
        data = []
        for u in pending:
            data.append({
                'id': u.id,
                'username': u.username,
                'first_name': u.first_name,
                'last_name': u.last_name,
                'email': u.email,
                'phone_number': u.phone_number,
                'date_joined': u.date_joined.strftime('%d/%m/%Y %H:%M'),
                'id_card_front': build_absolute_uri(request,u.id_card_front.url) if u.id_card_front else None,
                'id_card_back': build_absolute_uri(request,u.id_card_back.url) if u.id_card_back else None,
                'selfie_photo': build_absolute_uri(request,u.selfie_photo.url) if u.selfie_photo else None,
                'certificate_photo': build_absolute_uri(request,u.certificate_photo.url) if u.certificate_photo else None,
                'qualifications': u.qualifications if isinstance(u.qualifications, list) else [],
            })
        return Response(data)


class AdminApproveWorkerAPIView(APIView):
    """API duyệt hoặc từ chối tài khoản Carepartner"""
    permission_classes = [IsAdminUser]  # Yêu cầu quyền admin (is_staff=True)

    def post(self, request, user_id):
        action = request.data.get('action')  # 'approve' hoặc 'reject'
        qualifications = request.data.get('qualifications', []) # Array of strings

        try:
            worker = User.objects.get(id=user_id, role='worker')
            if action == 'approve':
                worker.is_approved = True
                worker.is_verified = True
                if isinstance(qualifications, list) and len(qualifications) > 0:
                    worker.qualifications = qualifications
                worker.save()
                return Response({'message': f'Đã duyệt tài khoản {worker.username}.'})
            elif action == 'reject':
                # Soft-delete: Đánh dấu là rejected thay vì xoá hẳn
                worker.is_approved = False
                worker.is_active = False  # Vô hiệu hoá đăng nhập
                worker.save()
                return Response({'message': f'Đã từ chối tài khoản {worker.username}.'})
            elif action == 'update_qualifications':
                if isinstance(qualifications, list):
                    worker.qualifications = qualifications
                    worker.save()
                    return Response({'message': f'Đã cập nhật bằng cấp cho {worker.username}.'})
                return Response({'error': 'Danh sách bằng cấp không hợp lệ.'}, status=400)
            else:
                return Response({'error': 'Action không hợp lệ.'}, status=400)
        except User.DoesNotExist:
            return Response({'error': 'Không tìm thấy tài khoản.'}, status=404)


class AdminToggleUserActiveAPIView(APIView):
    """API khoá/mở tài khoản người dùng (Admin)"""
    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        try:
            user = User.objects.get(id=user_id)
            # Không cho phép khoá chính mình hoặc superuser
            if user.id == request.user.id:
                return Response({'error': 'Không thể khoá chính tài khoản của bạn.'}, status=400)
            if user.is_superuser:
                return Response({'error': 'Không thể khoá tài khoản Superuser.'}, status=400)

            user.is_active = not user.is_active
            user.save(update_fields=['is_active'])
            status_text = 'mở khoá' if user.is_active else 'khoá'
            return Response({
                'message': f'Đã {status_text} tài khoản {user.username}.',
                'is_active': user.is_active,
            })
        except User.DoesNotExist:
            return Response({'error': 'Không tìm thấy tài khoản.'}, status=404)


class AdminRevokeCarepartnerAPIView(APIView):
    """API tước quyền Carepartner — đổi role từ worker về parent"""
    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        try:
            user = User.objects.get(id=user_id)
            if user.role != 'worker':
                return Response({'error': 'Tài khoản này không phải là Carepartner.'}, status=400)

            user.role = 'parent'
            user.is_approved = False
            user.is_verified = False
            user.qualifications = []
            user.save(update_fields=['role', 'is_approved', 'is_verified', 'qualifications'])
            return Response({
                'message': f'Đã tước quyền Carepartner của {user.username}. Tài khoản đã chuyển về vai trò Phụ huynh.',
            })
        except User.DoesNotExist:
            return Response({'error': 'Không tìm thấy tài khoản.'}, status=404)


class AdminAllUsersAPIView(APIView):
    """API lấy tất cả người dùng (Admin) — hỗ trợ khoá/mở tài khoản"""
    permission_classes = [IsAdminUser]

    def get(self, request):
        users = User.objects.filter(is_staff=False, is_superuser=False).order_by('-date_joined')
        data = []
        for u in users:
            data.append({
                'id': u.id,
                'username': u.username,
                'first_name': u.first_name,
                'last_name': u.last_name,
                'email': u.email,
                'phone_number': u.phone_number,
                'role': u.role,
                'is_active': u.is_active,
                'is_approved': u.is_approved,
                'is_verified': u.is_verified,
                'date_joined': u.date_joined.strftime('%d/%m/%Y %H:%M'),
                'qualifications': u.qualifications if isinstance(u.qualifications, list) else [],
            })
        return Response(data)


class AdminAllWorkersAPIView(APIView):
    """API lấy tất cả Carepartner (đã duyệt + chờ duyệt)"""
    permission_classes = [IsAdminUser]  # Yêu cầu quyền admin (is_staff=True)

    def get(self, request):
        workers = User.objects.filter(role='worker').order_by('-date_joined')
        data = []
        for u in workers:
            data.append({
                'id': u.id,
                'username': u.username,
                'first_name': u.first_name,
                'last_name': u.last_name,
                'email': u.email,
                'phone_number': u.phone_number,
                'is_approved': u.is_approved,
                'date_joined': u.date_joined.strftime('%d/%m/%Y %H:%M'),
                'id_card_front': build_absolute_uri(request,u.id_card_front.url) if u.id_card_front else None,
                'id_card_back': build_absolute_uri(request,u.id_card_back.url) if u.id_card_back else None,
                'selfie_photo': build_absolute_uri(request,u.selfie_photo.url) if u.selfie_photo else None,
                'certificate_photo': build_absolute_uri(request,u.certificate_photo.url) if u.certificate_photo else None,
                'qualifications': u.qualifications if isinstance(u.qualifications, list) else [],
            })
        return Response(data)

class AdminSeedDemoDataAPIView(APIView):
    """API tạo dữ liệu mẫu cho ban giám khảo — chỉ Admin mới gọi được"""
    permission_classes = [IsAdminUser]

    def post(self, request):
        from django.core.management import call_command
        from io import StringIO
        out = StringIO()
        call_command('seed_demo_data', stdout=out)
        output = out.getvalue()
        return Response({
            'message': 'Đã tạo dữ liệu mẫu thành công!',
            'details': output,
        })
