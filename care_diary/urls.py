from django.urls import path

from . import views

app_name = 'care_diary'

urlpatterns = [
    # Worker: tạo / sửa nhật ký
    path(
        'worker/tasks/<int:task_id>/care-diary/',
        views.WorkerCareDiaryAPIView.as_view(),
        name='worker-care-diary',
    ),
    # Xem nhật ký (parent hoặc worker)
    path(
        'tasks/<int:task_id>/care-diary/',
        views.CareDiaryDetailAPIView.as_view(),
        name='care-diary-detail',
    ),
    # Upload ảnh đính kèm
    path(
        'worker/tasks/<int:task_id>/care-diary/attachments/',
        views.WorkerCareDiaryAttachmentAPIView.as_view(),
        name='worker-care-diary-attachments',
    ),
    # Parent: lịch sử nhật ký (danh sách rút gọn)
    path(
        'parent/care-diary-history/',
        views.ParentCareDiaryHistoryAPIView.as_view(),
        name='parent-care-diary-history',
    ),
]
