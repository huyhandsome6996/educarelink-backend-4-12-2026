from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model


class Command(BaseCommand):
    help = (
        "Đặt lại mật khẩu cho TẤT CẢ tài khoản trong hệ thống về cùng một mật khẩu. "
        "Chỉ dùng cho môi trường demo/thi đấu, KHÔNG dùng khi đã có người dùng thật."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            type=str,
            default="@Huyhandsome2006",
            help="Mật khẩu mới sẽ áp dụng cho tất cả tài khoản.",
        )
        parser.add_argument(
            "--yes",
            action="store_true",
            help="Bỏ qua bước xác nhận (dùng khi chạy tự động, ví dụ Render Shell không tương tác).",
        )

    def handle(self, *args, **options):
        User = get_user_model()
        password = options["password"]
        confirmed = options["yes"]

        users = User.objects.all()
        count = users.count()

        if count == 0:
            self.stdout.write(self.style.WARNING("Không có tài khoản nào trong hệ thống."))
            return

        if not confirmed:
            answer = input(
                f"Sắp đặt lại mật khẩu cho {count} tài khoản về '{password}'. "
                f"Gõ 'yes' để xác nhận: "
            )
            if answer.strip().lower() != "yes":
                self.stdout.write(self.style.WARNING("Đã huỷ, không có gì thay đổi."))
                return

        updated = 0
        for user in users:
            user.set_password(password)
            user.save(update_fields=["password"])
            updated += 1

        self.stdout.write(
            self.style.SUCCESS(f"Đã đặt lại mật khẩu cho {updated}/{count} tài khoản.")
        )
