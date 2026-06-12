import shutil
import os

mapping = {
    r"stitch_educarelink_app_design\splash_screen\man_hinh_chao.html": "splash.html",
    r"stitch_educarelink_app_design\authentication_screen\dang_nhap.html": "login.html",
    r"stitch_educarelink_app_design\ng_k_t_i_kho_n\dang_ky.html": "register.html",
    r"stitch_educarelink_app_design\trang_ch_ph_huynh\trang_chu_phu_huynh.html": "parent_home.html",
    r"stitch_educarelink_app_design\ng_vi_c_m_i_1\dang_viec_buoc_1.html": "task_create_1.html",
    r"stitch_educarelink_app_design\ng_vi_c_m_i_2\dang_viec_buoc_2.html": "task_create_2.html",
    r"stitch_educarelink_app_design\vi_c_c_a_t_i\viec_da_dang.html": "parent_tasks.html",
    r"stitch_educarelink_app_design\duy_t_ng_vi_n\duyet_ung_vien.html": "browse_candidates.html",
    r"stitch_educarelink_app_design\nh_gi_carepartner\danh_gia.html": "review.html",
    r"stitch_educarelink_app_design\b_ng_tin_vi_c_l_m_carepartner\bang_tin_viec_lam.html": "worker_feed.html",
    r"stitch_educarelink_app_design\chi_ti_t_c_ng_vi_c_carepartner\job_detail.html": "task_detail.html",
    r"stitch_educarelink_app_design\vi_c_c_a_t_i_carepartner\viec_cua_toi.html": "worker_jobs.html",
    r"stitch_educarelink_app_design\h_s_carepartner\ho_so_ca_nhan.html": "worker_profile.html",
}

dest_dir = r"frontend\templates\frontend"
if not os.path.exists(dest_dir):
    os.makedirs(dest_dir)

for src, dest in mapping.items():
    src_path = os.path.join(os.getcwd(), src)
    dest_path = os.path.join(os.getcwd(), dest_dir, dest)
    if os.path.exists(src_path):
        shutil.copy(src_path, dest_path)
        print(f"Copied {src} to {dest_path}")
    else:
        print(f"Source NOT FOUND: {src_path}")
