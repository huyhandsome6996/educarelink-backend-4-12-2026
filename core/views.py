from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.contrib.auth import authenticate
from .models import User, Task, TaskApplication, ServiceCategory
from .serializers import UserSerializer, TaskSerializer, TaskApplicationSerializer, ServiceCategorySerializer

# --- 1. API ĐĂNG KÝ ---
class RegisterAPIView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer

# --- 2. API ĐĂNG NHẬP ---
class LoginAPIView(APIView):
    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        
        user = authenticate(username=username, password=password)
        if user:
            # Nếu đúng mật khẩu, trả về thông tin người dùng
            return Response({
                "message": "Đăng nhập thành công!",
                "user_id": user.id,
                "username": user.username,
                "role": user.role
            }, status=status.HTTP_200_OK)
        else:
            return Response({"error": "Sai tài khoản hoặc mật khẩu"}, status=status.HTTP_400_BAD_REQUEST)

# --- 3. API DANH SÁCH CÔNG VIỆC VÀ ĐĂNG VIỆC ---
# Phương thức GET: Lấy danh sách việc (Feed)
# Phương thức POST: Phụ huynh đăng việc mới
class TaskListCreateAPIView(generics.ListCreateAPIView):
    queryset = Task.objects.all().order_by('-created_at') # Mới nhất xếp trên
    serializer_class = TaskSerializer

# --- 4. API ỨNG TUYỂN CÔNG VIỆC ---
class ApplyTaskAPIView(APIView):
    def post(self, request, task_id):
        worker_id = request.data.get('worker_id')
        
        try:
            task = Task.objects.get(id=task_id)
            worker = User.objects.get(id=worker_id)
            
            # Tạo đơn ứng tuyển
            application, created = TaskApplication.objects.get_or_create(
                task=task,
                worker=worker,
                defaults={'status': 'pending'}
            )
            
            if created:
                return Response({"message": "Ứng tuyển thành công, đang chờ duyệt!"}, status=status.HTTP_201_CREATED)
            else:
                return Response({"message": "Bạn đã ứng tuyển công việc này rồi!"}, status=status.HTTP_400_BAD_REQUEST)
                
        except (Task.DoesNotExist, User.DoesNotExist):
            return Response({"error": "Không tìm thấy công việc hoặc người dùng."}, status=status.HTTP_404_NOT_FOUND)

# --- 5. API CHATBOT (KHUNG CHỜ SẴN CHO GEMINI) ---
class ChatbotAPIView(APIView):
    def post(self, request):
        user_message = request.data.get('message')
        
        # TODO: Ở Giai đoạn 4, chúng ta sẽ viết code gọi Google AI Studio tại đây!
        
        # Tạm thời trả về câu trả lời giả lập (Mockup)
        mock_response = f"AI đã nhận được tin nhắn của bạn: '{user_message}'. Hiện tại AI đang ngủ, vui lòng cắm API Key để đánh thức tôi!"
        
        return Response({
            "response": mock_response,
            "status": "waiting_for_gemini"
        }, status=status.HTTP_200_OK)