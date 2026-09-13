# MISSION BRIEF: FIX MATCHING ENGINE, LOCATION ANOMALIES, TUTORING AGE CRITERIA & REAL-TIME CAREGIVER GPS DISPATCHING

> **Target Repository**: `educarelink-backend-4-12-2026` (Django 5.2 monolith + React Native Expo SDK 54)  
> **Branch Rule**: Create and work on a new feature branch `feature/fix-matching-geo-tutors-gps` branched from `main`. Do not push broken tests. Commit messages in Vietnamese as required by `AGENTS.md`.  
> **Single Source of Truth**: Refer to `AGENTS.md` before touching any backend or mobile code.

---

## 1. CONTEXT & EXECUTIVE SUMMARY

During staging review and mobile testing of EduCareLink (a Vietnam-based childcare & university student tutor matching platform), four critical bugs and product deficiencies were identified in the Parent Tutoring flow:

1. **Missing Literature Tutors (Môn Văn / Ngữ văn)**: Parents searching for Literature tutors in Huế get 0 candidates because `seed_demo_data.py` lacks tutors with Literature credentials, and `matching_service.py` strictly skill-gates subjects.
2. **Location & Schedule Mismatch (Huế vs Cầu Giấy, Hà Nội)**: Parents choosing dates and locations in Huế are presented with "Cầu Giấy, Hà Nội" labels due to hardcoded fallback strings and mock fallbacks when candidate pools are empty.
3. **Missing Child Grade/Age & Tutor Seniority Filters**: `TutoringForm.js` only asks for freeform subject text without structured selectors for the child's grade/age level (Grades 1-5, 6-9, 10-12) or tutor academic level.
4. **Static Registration Address vs. Real-Time Location Mismatch**: The matching algorithm uses the student's static profile coordinates (`User.latitude/longitude`). If a student registered in Huế is traveling in Hà Nội, they are erroneously matched to a Huế job.

---

## 2. DETAILED DEFECT AUDIT & ROOT CAUSE ANALYSIS

### Defect 1: Literature/Ngữ Văn Tutor Absence & Hard Gating
- **Files**:
  - `core/management/commands/seed_demo_data.py` (lines 440–570)
  - `matching/services/matching_service.py` (lines 118–129, 283–294)
  - `matching/services/gemini_service.py` (line 35)
- **Root Cause**:
  In `seed_demo_data.py`, none of the active CarePartners has `major: "Sư phạm Ngữ Văn"` or `skills: ["van", "ngu_van", "tieng_viet", "luyen_chu_dep"]`. When Gemini parses the prompt for "Văn", it sets `required_skills: ["van"]`. In `matching_service.py`:
  ```python
  if required_skills and not has_skill_match and not has_major_match:
      continue
  ```
  Since no tutor in Huế has Literature skills, 100% of candidates are dropped, returning `total_matched: 0`.

### Defect 2: Hardcoded "Cầu Giấy, Hà Nội" & False Location Rendering
- **Files**:
  - `mobile/src/screens/Parent/TutoringForm.js` (lines 175, 210)
  - `mobile/src/screens/Parent/ChildcareForm.js` (lines 178, 212)
  - `mobile/src/screens/Parent/CandidatesListScreen.js` (lines 60, 511, and DEMO_CANDIDATES array lines 63–192)
  - `mobile/src/screens/Parent/ParentHomeScreen.js` (line 189)
  - `mobile/src/components/JobLocationPicker.js` (lines 40–41: `DEFAULT_LAT = 21.0278; DEFAULT_LNG = 105.8342`)
- **Root Cause**:
  1. `TutoringForm.js` lines 175 & 210 explicitly fallback: `location_note: locationNote || 'Cầu Giấy, Hà Nội'`. If the parent selects map coordinates in Huế but leaves the text note blank, the app assigns "Cầu Giấy, Hà Nội".
  2. `CandidatesListScreen.js` line 511 hardcodes: `<Text>— Phụ huynh đã sử dụng dịch vụ tại Cầu Giấy</Text>`.
  3. When `getMatchingCandidates(jobId)` returns 0 candidates (due to Defect 1), `CandidatesListScreen.js` drops into demo preview or prefetch fallback, rendering `DEMO_CANDIDATES` who are all hardcoded from universities in Cầu Giấy, Hà Nội.
  4. `JobLocationPicker.js` defaults center to Hanoi coordinates. If the parent doesn't explicitly tap to relocate to Huế, the job payload carries Hanoi coordinates (~540km away from Huế students, violating the 35km radius filter).

### Defect 3: Missing Age/Grade Selection in Tutoring Form
- **Files**:
  - `mobile/src/screens/Parent/TutoringForm.js`
  - `matching/services/job_schema.py` (lines 61–75: `REQUIRED_BY_TYPE`, `OPTIONAL_BY_TYPE`)
  - `matching/models.py` (`JobPost.type_data`)
- **Root Cause**:
  `job_schema.py` does not include `child_grade_level` or `child_age_group` in `OPTIONAL_BY_TYPE['tutoring']`. The mobile screen has no UI selector for whether the tutoring is for elementary (lớp 1–5), middle school (lớp 6–9), or high school (lớp 10–12).

### Defect 4: CarePartner Location Drift (Hue vs Hanoi Vacation Dispatching)
- **Files**:
  - `core/models.py` (`User` model)
  - `matching/services/matching_service.py` (lines 269–274)
  - `mobile/src/context/AuthContext.js` / CarePartner app background/foreground services
- **Root Cause**:
  Distance filtering relies strictly on `user.latitude` and `user.longitude` (the home/dorm address recorded at registration). When a student goes home or travels outside their registered city, EduCareLink has no recent GPS coordinates to prevent dispatching them to local jobs.

---

## 3. IMPLEMENTATION REQUIREMENTS (STEP-BY-STEP)

### Task 1: Seed Literature Tutors in Hue & Hanoi
1. Update `core/management/commands/seed_demo_data.py`:
   - Add at least 2 verified, active CarePartners specializing in Literature in TP. Huế:
     - `carepartner_van_hue`: Lê Thị Mai Phương, ĐH Sư Phạm - Đại học Huế, Khoa Sư phạm Ngữ Văn (Năm 3). Skills: `["van", "ngu_van", "tieng_viet", "luyen_chu_dep", "tieu_hoc", "cap_2", "kien_nhan"]`. Rating 4.95, ELO 1510. Address in TP. Huế (e.g. Lê Lợi, TP. Huế; lat 16.468, lng 107.589). Schedule available on all weekdays 17:00–21:30 and weekends.
     - `carepartner_tieuhoc_hue`: Nguyễn Hoàng Anh Thư, ĐH Sư Phạm Huế, Khoa Giáo dục Tiểu học. Skills: `["tieng_viet", "van", "toan", "luyen_chu_dep"]`.
   - Ensure `sinhvien_test` also includes `"tieng_viet"` and `"van"` in their skills list if tutoring primary school.
2. In `matching/services/matching_service.py`:
   - Verify `_major_match_bonus()` correctly recognizes `ngữ văn`, `ngu van`, `văn học`, `van hoc`, `sư phạm văn`, `tiểu học` when `required_skills` includes `van` or `tieng_viet`.
3. Re-run `python seed_data.py` to ensure clean database state.

### Task 2: Eradicate Hardcoded Hanoi Fallbacks & Fix Geocoding in Mobile
1. In `mobile/src/screens/Parent/TutoringForm.js` & `ChildcareForm.js`:
   - REMOVE ALL instances of `'Cầu Giấy, Hà Nội'` fallback strings.
   - If `locationNote` is empty, use `location.label` (from reverse geocoding) or generate a clean Vietnamese label based on the coordinates: `Vị trí đã chọn trên bản đồ`.
2. In `mobile/src/components/JobLocationPicker.js`:
   - If the current user has `user.address` or `user.latitude/longitude` (e.g., in TP. Huế), initialize the map viewport centered at the user's registered location rather than hardcoded Hanoi (`DEFAULT_LAT = 21.0278`).
   - Automatically trigger reverse-geocoding to set a human-readable address when a pin is dropped.
3. In `mobile/src/screens/Parent/CandidatesListScreen.js`:
   - REMOVE line 511 hardcoded text: `<Text>— Phụ huynh đã sử dụng dịch vụ tại Cầu Giấy</Text>`. Dynamically display `— Phụ huynh tại ${c.location_district || 'khu vực của bạn'}`.
   - When API returns 0 candidates, DO NOT silently display `DEMO_CANDIDATES` from Hanoi. Instead, show an authentic empty state:
     - Title: "Chưa tìm thấy CarePartner phù hợp trong khu vực"
     - Subtitle: "Thử điều chỉnh khung giờ, giảm tiêu chí hoặc mở rộng bán kính tìm kiếm quanh địa điểm đã chọn."
     - Action button: "Điều chỉnh yêu cầu / Đổi khung giờ".

### Task 3: Implement Child Grade/Age & Tutor Seniority Selector in Tutoring Form
1. Backend (`matching/services/job_schema.py` & `matching/services/gemini_service.py`):
   - Add `child_grade_level` and `tutor_seniority_preference` to `OPTIONAL_BY_TYPE['tutoring']`.
   - Support standard levels:
     - `preschool_prep`: Tiền tiểu học (4 - 6 tuổi)
     - `primary_grade_1_5`: Tiểu học (Lớp 1 - 5)
     - `secondary_grade_6_9`: THCS (Lớp 6 - 9)
     - `high_school_grade_10_12`: THPT (Lớp 10 - 12)
   - Store these in `JobPost.type_data`.
2. Frontend (`mobile/src/screens/Parent/TutoringForm.js`):
   - Add an interactive pill-selector for **"Khối lớp / Độ tuổi của bé"**:
     - `Tiền tiểu học (4-6t)` | `Tiểu học (Lớp 1-5)` | `THCS (Lớp 6-9)` | `THPT (Lớp 10-12)`
   - Add an optional chip selector for **"Ưu tiên gia sư"**:
     - `Sinh viên năm 1-2` | `Sinh viên năm 3-4 (Ưu tiên Sư phạm)` | `Cử nhân / Đã tốt nghiệp` | `Không yêu cầu`
   - Include these selected fields in the `createJob()` payload.
3. Matching Engine (`matching/services/matching_service.py`):
   - If `child_grade_level == 'primary_grade_1_5'`, give bonus to tutors with `major` in "Giáo dục Tiểu học" or "Sư phạm".
   - If `child_grade_level in ['secondary_grade_6_9', 'high_school_grade_10_12']`, verify tutor major matches the specific subject.

### Task 4: Real-time CarePartner GPS Tracking & Vacation/Out-of-Town Guard
1. Backend Database & API:
   - In `core/models.py` (`User` model), add:
     - `current_latitude = models.FloatField(null=True, blank=True)`
     - `current_longitude = models.FloatField(null=True, blank=True)`
     - `last_gps_updated_at = models.DateTimeField(null=True, blank=True)`
   - Create and apply Django migration.
   - Expose a lightweight endpoint (or support in `PATCH /api/profile/` or `POST /api/tracking/heartbeat/`):
     - CarePartner mobile app sends `{ latitude, longitude }`. Server updates `current_latitude`, `current_longitude`, and `last_gps_updated_at = timezone.now()`.
2. Matching Engine Filter (`matching/services/matching_service.py`):
   - Implement **Effective Location Detection**:
     ```python
     def get_effective_coordinates(user):
         # If user has a recent GPS update (e.g. within the last 48 hours), use real-time GPS
         if user.current_latitude and user.current_longitude and user.last_gps_updated_at:
             if (timezone.now() - user.last_gps_updated_at).total_seconds() < 48 * 3600:
                 return user.current_latitude, user.current_longitude, True
         return user.latitude, user.longitude, False
     ```
   - If a CarePartner's real-time GPS is > 50km from their registered city, or if distance from `job.latitude/longitude` to their real-time GPS exceeds `max_allowed_km`, **drop them from the match pool**.
   - This directly prevents the scenario where a Huế student holidaying in Hanoi gets notified for a job in Huế.
3. Mobile App Client:
   - When a CarePartner opens the app or logs in, request foreground location via `expo-location` and dispatch a background sync to update `current_latitude` / `current_longitude`.

---

## 4. VERIFICATION & ACCEPTANCE CRITERIA

1. **Automated Backend Tests**:
   - Run `python manage.py test matching.tests` → 100% PASS.
   - Add test case verifying that a job with subject "Văn" / "Ngữ văn" in TP. Huế successfully matches `carepartner_van_hue`.
   - Add test case verifying that a CarePartner with registered address in Huế whose `current_latitude/longitude` is in Hanoi is EXCLUDED from Huế job matching.
2. **Automated Mobile Tests**:
   - Run `npm test` in `mobile/` → 100% PASS (91/91 + new test suites).
3. **Manual Flow Verification**:
   - Run `python seed_data.py`.
   - Open Parent app on mobile → create Tutoring job for "Ngữ văn lớp 4" at an address in TP. Huế.
   - Verify that candidates returned are teachers/students from Huế universities (ĐH Sư Phạm Huế), and NO mentions of "Cầu Giấy, Hà Nội" appear on screen.
   - Verify that grade/age level selected in the form is properly reflected in job details.
