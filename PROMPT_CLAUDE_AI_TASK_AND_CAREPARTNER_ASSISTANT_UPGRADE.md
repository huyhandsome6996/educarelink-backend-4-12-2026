# ARCHITECTURAL MIGRATION BRIEF: Upgrading EduCareLink AI Chatbot & Task Creation to Flow 1/2 Geo-Matching Engine

---

## 1. Executive Context & The Core Problem

We are developing **EduCareLink**, an on-demand caregiving and tutoring platform in Vietnam connecting **Parents** with vetted **CarePartners** (university students & educators) for tutoring, childcare, and school pickup services.

- **Repository**: `https://github.com/huyhandsome6996/educarelink-backend-4-12-2026`
- **Active Working Branch**: `feature/fix-matching-geo-tutors-gps`
- **Core Tech Stack**:
  - **Backend**: Django 5.2 monolith, Django REST Framework (DRF), SimpleJWT, PostgreSQL/SQLite, Google Gemini 2.5 Flash (`google-genai` SDK / connection pooling in `performance/gemini_pool.py`), MoMo Escrow Payment v2, Haversine GPS distance.
  - **Web Frontend**: Django Templates + Tailwind CSS (HTML in `frontend/templates/frontend/`, vanilla JS with `apiFetch`).
  - **Mobile App**: React Native 0.81.5, Expo SDK 54 (`mobile/`), React 19.1.0, React Navigation 7.x.

### 🚨 The Root Problem to Fix
Recently, the entire platform underwent a major architectural evolution:
1. **The New Flow 1 & Flow 2 Matching Engine** (`matching/` app) replaced the old open-marketplace model:
   - **New Models**: `JobPost` (`tutoring`, `childcare`, `pickup`), `JobSlot`, `Booking` (`awaiting_commitment` -> `committed` -> `in_progress` -> `completed`), `AvailabilityWindow` (recurring weekly slots), `CarePartnerBlackout` (off-days/exams), `EloRating`.
   - **New Logic**: Algorithmic radar matching based on availability window intersection, Haversine GPS radius <= 10km, subject/skill matching, trust score ranking, followed by 100% MoMo Escrow hold and a 60-minute CarePartner commitment countdown.
2. **The Outdated AI Assistant**:
   - The current AI endpoints (`ChatbotAPIView` and `WorkerChatbotAPIView` in `core/views.py`) are **obsolete**:
     - They still teach Google Gemini the deprecated **8-category marketplace schema** (including cleaning, grocery shopping, cooking, etc.).
     - They generate legacy `<TASK_JSON>` which creates old `core.models.Task` records with `status='open'`.
     - These tasks **do not enter the matching radar**, do not have structured parameters (grade levels, subjects, slots, hourly rates), cannot calculate candidate match scores, and cannot trigger the automated booking escrow flow.
   - On the **CarePartner side**, the AI assistant is purely generic and knows nothing about the CarePartner's availability calendar, blackout dates, GPS radius, or why they are not receiving matches.
   - On both **Web** (`frontend/templates/frontend/chatbot.html` & `worker_chatbot.html`) and **Mobile** (`mobile/src/screens/ChatbotScreen.js` & `mobile/src/screens/Worker/WorkerChatbotScreen.js`), the UI renders obsolete task preview cards that submit to legacy endpoints.

---

## 2. Parent AI Assistant: Natural Language Job Creation & Instant Radar Matching

### A. Core Requirements
When a parent chats with the AI (e.g., *"Tôi cần tìm gia sư dạy kèm Toán và Tiếng Việt cho bé lớp 3 tại Times City tối thứ 3 và thứ 5 từ 18h30 đến 20h30, giá 120k/h"*), the AI must:
1. **Identify the exact `job_type`**: Strictly 1 of 3 types:
   - `tutoring`: Gia sư & Kèm học (Toán, Văn, Anh, Tiểu học, v.v.)
   - `childcare`: Trông trẻ tại nhà (Cho bé ăn, chơi, rèn nếp)
   - `pickup`: Đón trẻ tan học (Đón cổng trường về nhà / lớp học thêm)
2. **Extract & Polish Job Parameters**:
   - `title`: Well-crafted Vietnamese title (e.g., *"Gia sư Toán & Tiếng Việt lớp 3 tại nhà"*).
   - `description`: Clear list of requirements, curriculum goals, and notes.
   - `hourly_rate_vnd`: Integer >= 50,000 VND (guide user if rate is too low for the market).
   - `location`: Exact address string + Geo coordinates (if geocodable, or prompt user to confirm address on map).
   - `slots`: Array of specific dates/times or weekly recurrence (`weekdays: [1, 3]`, `time_from: "18:30"`, `time_to: "20:30"`).
   - `type_data`: Schema-compliant attributes matching `matching/services/job_schema.py`:
     - *Tutoring*: `subjects` (list), `grade_level`, `student_gender`, `curriculum_type`.
     - *Childcare*: `child_age`, `care_duties`, `special_needs`.
     - *Pickup*: `pickup_location`, `dropoff_location`, `transport_mode` ('motorbike', 'car', 'walking').
3. **Structured XML Response Tag**:
   The AI responds with friendly conversational Vietnamese AND outputs a structured XML block:
   ```xml
   <MATCHING_JOB_JSON>
   {
     "job_type": "tutoring",
     "title": "Gia sư Toán & Tiếng Việt lớp 3 tại Times City",
     "description": "Kèm bé ôn bài trên lớp và rèn chữ, 2 buổi/tuần.",
     "hourly_rate_vnd": 120000,
     "location": "Tòa T8 Times City, 458 Minh Khai, Hai Bà Trưng, Hà Nội",
     "latitude": 20.9958,
     "longitude": 105.8672,
     "slots": [
       { "date": "2026-09-22", "time_from": "18:30", "time_to": "20:30" },
       { "date": "2026-09-24", "time_from": "18:30", "time_to": "20:30" }
     ],
     "type_data": {
       "subjects": ["math", "vietnamese"],
       "grade_level": "grade_3",
       "student_gender": "any"
     }
   }
   </MATCHING_JOB_JSON>
   ```

### B. Action Execution & Instant Radar Feedback
- When the backend parses `<MATCHING_JOB_JSON>`:
  - Creates a `matching.models.JobPost` (status: `open_for_selection` or `draft`).
  - Calls `matching.services.matching_service.find_matching_carepartners(job_post)`.
  - Returns the created `job_id`, total matched count (e.g. `total_matched: 8`), and a preview of the top 3 CarePartners (name, university, rating, distance).
- **UI Card in Chat (Web & Mobile)**:
  - Renders a **Google Stitch Bento Job Confirmation Card** directly inline in the message list:
    - Service badge (`Gia sư`, `Trông trẻ`, or `Đón trẻ`).
    - Schedule pills & Hourly rate.
    - Radar Pulse Indicator: *"AI đã quét thấy 8 CarePartner phù hợp trong bán kính 5km!"*.
    - Two action CTAs:
      - **"Xem & Chọn CarePartner Ngay"** -> Directly navigates to `CandidatesListScreen` (`/parent/matching/jobs/<id>/candidates/`) with the candidates loaded!
      - **"Chỉnh sửa thông tin"** -> Opens edit dialog.

---

## 3. CarePartner AI Assistant: Smart Co-Pilot & Schedule Optimizer

### A. Core Requirements
The CarePartner AI assistant (`/api/worker/chatbot/`) must transform from a generic bot into an **intelligent career & schedule copilot**:

1. **Radar Diagnostics & Matching Assistance**:
   - Question: *"Tại sao hôm nay em chưa nhận được đơn nào?"* or *"Làm sao để nhận được nhiều việc hơn?"*.
   - AI Action: Queries CarePartner's current profile:
     - Active availability windows (`AvailabilityWindow`).
     - Blackout dates (`CarePartnerBlackout`).
     - GPS coordinates & active radius (10km).
     - Elo trust tier & completed jobs.
   - AI Response: Clear, encouraging breakdown:
     - *"Hiện tại bạn chỉ mở lịch 18:00 - 21:00 tối Thứ 2 và Thứ 4. Trong bán kính 8km quanh ĐH Sư Phạm, có 14 phụ huynh đang tìm người đón trẻ khung giờ 16:00 - 17:30!"*
     - Suggestion: *"Mở thêm ca chiều Thứ 3 & Thứ 5 để tăng +35% cơ hội ghép việc!"*.

2. **Smart Blackout Extraction from Natural Language**:
   - CarePartner says: *"Tuần sau em bận thi Giải Tích 2 sáng Thứ 4 (23/09) từ 7h đến 11h, và thứ 7 về quê cả ngày"*.
   - The AI responds empathetically and outputs an action tag:
     ```xml
     <BLACKOUT_ACTION_JSON>
     [
       {
         "date": "2026-09-23",
         "reason": "exam",
         "note": "Thi Giải Tích 2",
         "time_from": "07:00",
         "time_to": "11:00"
       },
       {
         "date": "2026-09-26",
         "reason": "travel",
         "note": "Về quê thăm gia đình",
         "time_from": null,
         "time_to": null
       }
     ]
     </BLACKOUT_ACTION_JSON>
     ```
   - **UI Action**: Renders an inline card in chat: *"Phát hiện 2 lịch bận thi cử & về quê"* with a 1-tap button **"Lưu vào Lịch Bận & Bảo vệ ELO"** that directly calls `addBlackout()`!

3. **Availability Optimization**:
   - Recommends "Giờ vàng" (18:00 - 21:00) and calculates weekly potential earnings based on open hours (80k - 120k/h).

---

## 4. Technical Fullstack Implementation Tasks

### Layer 1: Backend (`core/` & `matching/`)
1. **Refactor / Upgrade AI Prompt Engine**:
   - Location: Update `core/views.py` (`ChatbotAPIView` and `WorkerChatbotAPIView`) OR create `matching/api/ai_views.py`.
   - Use Google Gemini 2.5 Flash via `performance.gemini_model.generate_content_with_fallback` and connection pooling.
   - System prompts must strictly enforce Vietnamese with diacritics, zero jargon, and the exact schemas (`MATCHING_JOB_JSON` and `BLACKOUT_ACTION_JSON`).
2. **Backend Action Dispatcher**:
   - When `MATCHING_JOB_JSON` is parsed:
     - Automatically validate payload with `matching.serializers.JobPostCreateSerializer`.
     - Save `JobPost` linked to `request.user`.
     - Run `find_matching_carepartners(job_post)`.
     - Return JSON containing `message`, `job_post_data`, `matched_candidates_preview`.
   - When `BLACKOUT_ACTION_JSON` is parsed:
     - Provide a preview for the user to confirm before saving.

### Layer 2: Web Frontend (`frontend/`)
1. **Parent Chatbot (`frontend/templates/frontend/chatbot.html`)**:
   - Update message parser to detect `<MATCHING_JOB_JSON>` in AI responses.
   - Render a modern Google Stitch Bento Job Preview Card:
     - Displays job type badge, title, schedule, estimated fee.
     - Displays live radar matching pulse.
     - Action button: **"Xem CarePartner Phù Hợp"** -> links to `{% url 'frontend:matching_candidates' job_id %}`.
2. **Worker Chatbot (`frontend/templates/frontend/worker_chatbot.html`)**:
   - Update message parser to detect `<BLACKOUT_ACTION_JSON>`.
   - Render inline Blackout Save Card with 1-tap call to `/api/matching/carepartners/me/blackouts/`.
   - Display Radar Diagnostics tips with quick link to `/worker/availability/`.

### Layer 3: Mobile App (`mobile/`)
1. **Parent Chatbot Screen (`mobile/src/screens/ChatbotScreen.js`)**:
   - Detect `<MATCHING_JOB_JSON>` in chat stream.
   - Render inline React Native Bento Card:
     - Icon & Category badge (`Gia sư`, `Trông trẻ`, `Đón trẻ`).
     - Schedule, location, and fee.
     - Primary button: Navigates to `CandidatesList` screen with `{ jobId: newJobId }`.
2. **Worker Chatbot Screen (`mobile/src/screens/Worker/WorkerChatbotScreen.js`)**:
   - Detect `<BLACKOUT_ACTION_JSON>`.
   - Render 1-tap confirmation card to add blackout date and navigate to `BlackoutScreen`.
   - Safe Area insets defensive fallback (`try/catch`).
3. **API Client (`mobile/src/api/tasks.js` & `matching.js`)**:
   - Ensure timeouts for AI queries remain >= 45-60s to prevent mobile aborts during Gemini reasoning.

---

## 5. Verification & Acceptance Criteria

1. **Automated Tests**:
   - Backend unit test: Verify `ChatbotAPIView` correctly extracts `MATCHING_JOB_JSON` and creates a `JobPost` in the database.
   - Backend unit test: Verify `WorkerChatbotAPIView` correctly extracts `BLACKOUT_ACTION_JSON`.
   - Mobile test: `ChatbotScreen.acceptance.test.js` verifying the new Bento card renders and navigation to `CandidatesList` works.
   - Mobile test: `WorkerChatbotScreen.acceptance.test.js` verifying the blackout card renders and invokes `addBlackout`.
2. **Full Regression Check**:
   - `npm test` in `mobile/` MUST remain 100% PASSING (currently 15 suites / 120 tests).
   - Python tests: `python manage.py test matching` MUST PASS.
3. **Git Commit Rule**:
   - Work strictly on branch `feature/fix-matching-geo-tutors-gps`.
   - Commit messages in clean Vietnamese, e.g.:
     `"Nâng cấp AI Chatbot và Đăng việc thông minh theo luồng ghép cặp Flow 1/2 trên Web và Mobile"`
