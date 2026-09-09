#!/usr/bin/env python
"""Trích xuất khối mã ```html ... ``` từ file spec parent_home redesign."""
import os
import re

SRC = "/home/z/my-project/upload/Pasted Content_1788987873809.txt"
OUT = "/home/z/my-project/scripts/_parent_home_redesign_extracted.html"

with open(SRC, "r", encoding="utf-8") as f:
    content = f.read()

# Tìm tất cả các khối fenced code
blocks = re.findall(r"```html\n(.*?)\n```", content, re.S)
print(f"Số khối ```html tìm thấy: {len(blocks)}")
if not blocks:
    raise SystemExit("Không tìm thấy khối mã!")

code = blocks[0]
# Django template có chứa {% %} — không escape
with open(OUT, "w", encoding="utf-8") as f:
    f.write(code + "\n")

lines = code.splitlines()
print(f"Độ dài mã: {len(lines)} dòng, {len(code)} ký tự")
print(f"Dòng đầu: {lines[0]!r}")
print(f"Dòng cuối: {lines[-1]!r}")

# Kiểm tra các contract quan trọng theo spec mục 2
checks = {
    "load static": "{% load static %}" in code,
    "include sidebar home": "{% include 'frontend/_parent_sidebar.html' with active_tab='home' %}" in code,
    "url parent_home": "{% url 'frontend:parent_home' %}" in code,
    "url dang_viec_select": "{% url 'frontend:dang_viec_select' %}" in code,
    "url vi_credit": "{% url 'frontend:vi_credit' %}" in code,
    "favicon-32": "favicon-32.png" in code,
    "logo.png": "/static/images/logo.png" in code or "images/logo.png" in code,
    "stat-total": "stat-total" in code,
    "stat-open": "stat-open" in code,
    "stat-inprogress": "stat-inprogress" in code,
    "task-list": "task-list" in code,
    "desktop-insight-pill": "desktop-insight-pill" in code,
    "cta-shimmer": "cta-shimmer" in code,
    "no upgrade-modal (đã loại bỏ)": "upgrade-modal" not in code,
    "task-detail link": "/parent/task-detail/?task_id=" in code,
}
for k, v in checks.items():
    print(f"{'PASS' if v else 'FAIL'}: {k}")
