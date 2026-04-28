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

# --- PHẦN 5: CHATBOT AI ---
class ChatbotAPIView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request):
        user_message = request.data.get('message')
        return Response({"response": f"AI đang chờ tích hợp! Bạn vừa nói: {user_message}"})