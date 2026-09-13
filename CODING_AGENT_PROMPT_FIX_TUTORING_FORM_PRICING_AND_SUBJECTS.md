# MASTER PROMPT: REFACTOR TUTORING FORM (DYNAMIC PRICING, STRUCTURED AGE-BASED CURRICULUM SUBJECTS) & MATCHING ENGINE INTEGRATION

> **Target Repository**: `educarelink-backend-4-12-2026` (Django 5.2 Monolith + React Native Expo SDK 54)  
> **Target Audience**: Coding Agent / Senior Full-Stack Engineer (Claude 3.7 Sonnet / Claude 4.6)  
> **Working Branch**: `feature/tutoring-pricing-subjects-geo-gps` (Create from `main`)  
> **Commit Language**: **Vietnamese** (Mandatory as per `AGENTS.md`)  
> **Execution Rule**: Do NOT cut corners. Deliver complete, production-grade implementations across backend, frontend, and tests.

---

## 1. EXECUTIVE SUMMARY & IDENTIFIED DEFICIENCIES

During mobile staging review on Expo Go, two major functional issues were verified in the Parent Tutoring flow (`mobile/src/screens/Parent/TutoringForm.js`):

### Issue A: Fake / Broken Estimated Price Calculation ("Tạm tính")
- **The Bug**: The price displayed at the bottom dock is completely hardcoded and purely decorative:
  ```javascript
  // TutoringForm.js Line 226
  const estimatedPerSession = (Number(rate) || 120000) * 2;
  // TutoringForm.js Line 541
  <Text style={styles.dockSub}>Tạm tính 1 ca (2h):</Text>
  ```
- **Consequences**:
  - If a parent selects `18:00 - 21:00` (3 hours) or `14:00 - 15:30` (1.5 hours), the estimation always assumes 2 hours.
  - It completely ignores `dates.length`. If a parent books 3 sessions across 3 days, it still displays the cost of a single 2-hour session.
  - Parents cannot verify the true total cost of their multi-session booking before committing funds.

### Issue B: Unstructured Free-Text Subjects & Missing Age Progression
- **The Problem**: Currently, `TutoringForm.js` expects parents to manually type subject names into a text input or select from generic quick tags (`Toán lớp 5`, `MC nhí`, `Piano`). There is no child age input, leading to vague requests, mismatched tutors, and search failures.
- **The Solution (Product Specification)**:
  Replace free-text guesswork with a **structured, 2-step selection**:
  1. **Input Child's Age (6 to 18 years old)**.
  2. Based on the age, dynamically render the exact official Vietnamese curriculum subject pills for the child's school tier:
     - **Tier 1 (Ages 6 - 10 / Cấp 1 - Primary School)**:
       * Toán, Tiếng Việt, Tự nhiên và Xã hội, Âm nhạc, Mỹ thuật, Tin học và Công nghệ, Lịch sử, Địa lý, Tiếng Anh, Tiếng Trung.
     - **Tier 2 (Ages 11 - 15 / Cấp 2 - Secondary / Middle School)**:
       * Toán, Ngữ văn, Tiếng Anh, Tiếng Trung, Giáo dục công dân, Khoa học tự nhiên, Lịch sử và Địa lý, Tin học, Công nghệ, Âm nhạc, Mỹ thuật, Hoá học, Vật lý, Sinh học.
     - **Tier 3 (Ages 16 - 18 / Cấp 3 - High School)**:
       * Toán, Ngữ văn, Tiếng Anh, Tiếng Trung, Lịch sử, Vật lý, Hoá học, Sinh học, Địa lý, Giáo dục kinh tế và Pháp luật, Tin học, Công nghệ, Âm nhạc, Mỹ thuật.

### Associated Critical Deficiencies (Carried from Previous Audit)
1. **Eradicate Hardcoded "Cầu Giấy, Hà Nội" Strings**: Remove fallback strings in `TutoringForm.js` (lines 175, 210), `ChildcareForm.js` (lines 178, 212), and `CandidatesListScreen.js` (lines 60, 511).
2. **Seed Data Deficit in Huế**: Ensure `seed_demo_data.py` contains verified CarePartners in TP. Huế specializing in Literature (Ngữ văn), Primary Education (Giáo dục Tiểu học), and foreign languages.
3. **CarePartner Real-Time GPS vs. Static Registration**: Prioritize `current_latitude/longitude` over static registration address in `matching_service.py` to prevent cross-city dispatching when students are traveling.

---

## 2. DETAILED TECHNICAL ARCHITECTURE & CHANGES

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PARENT TUTORING FLOW ARCHITECTURE                     │
│                                                                             │
│  [Step 1: Input Child Age (6-18)] ──► [Auto-Detect School Tier: Cấp 1/2/3]  │
│                                                   │                         │
│                                                   ▼                         │
│  [Dynamic Subject Grid] ◄────────────── [Curriculum Subject Whitelist]      │
│  (One-tap pill selection)                         │                         │
│                                                   ▼                         │
│  [Time & Dates Picker] ────────────────► [Real-Time Duration & Price Engine]│
│  (time_from, time_to, dates[])           (Hours × Rate/Hour × Sessions)     │
│                                                   │                         │
│                                                   ▼                         │
│  [API Payload] ────────────────────────► [POST /api/matching/jobs/]         │
│  { child_age, school_level, subject,              │                         │
│    hourly_rate_vnd, dates, time_from, time_to }   ▼                         │
│                                          [matching/services/job_schema.py]  │
│                                                   │                         │
│                                                   ▼                         │
│                                          [matching/services/matching_service]│
│                                          (Skill-gating + GPS + Tier bonus)  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. STEP-BY-STEP IMPLEMENTATION INSTRUCTIONS

### TASK 1: Dynamic Real-Time Price Engine in `TutoringForm.js`

**File**: `mobile/src/screens/Parent/TutoringForm.js`

1. **Duration & Price Calculation Function**:
   Replace the hardcoded `const estimatedPerSession = (Number(rate) || 120000) * 2;` with a robust calculation helper:
   ```javascript
   // Helper to calculate exact hours between two 'HH:mm' strings
   const calculateSessionDurationHours = (startStr, endStr) => {
     if (!startStr || !endStr) return 2.0;
     try {
       const [startH, startM] = startStr.split(':').map(Number);
       const [endH, endM] = endStr.split(':').map(Number);
       const startTotal = startH * 60 + startM;
       const endTotal = endH * 60 + endM;
       if (endTotal <= startTotal) return 2.0;
       const diffMinutes = endTotal - startTotal;
       return Number((diffMinutes / 60).toFixed(2));
     } catch {
       return 2.0;
     }
   };

   // Active reactive calculations
   const sessionDurationHours = calculateSessionDurationHours(timeFrom, timeTo);
   const hourlyRate = Math.max(0, Number(rate) || 120000);
   const costPerSession = Math.round(sessionDurationHours * hourlyRate);
   const sessionCount = dates.length > 0 ? dates.length : 1;
   const totalEstimatedCost = costPerSession * sessionCount;
   ```

2. **Update the Sticky Bottom Dock UI**:
   Replace line 540–550 with an informative, dynamic summary:
   ```jsx
   <View style={styles.dockLeft}>
     <Text style={styles.dockSub}>
       {dates.length > 0
         ? `Tạm tính (${sessionDurationHours}h × ${sessionCount} buổi):`
         : `Tạm tính 1 ca (${sessionDurationHours}h):`}
     </Text>
     <Text style={styles.dockPrice}>
       {totalEstimatedCost.toLocaleString('vi-VN')}
       <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748B' }}>đ</Text>
     </Text>
     <View style={styles.guaranteePill}>
       <View style={styles.guaranteeDot} />
       <Text style={styles.guaranteeText}>
         {dates.length > 1
           ? `${costPerSession.toLocaleString('vi-VN')}đ / buổi`
           : 'Bảo vệ hoàn tiền 100%'}
       </Text>
     </View>
   </View>
   ```

---

### TASK 2: Structured Age & Subject Selection UI

**File**: `mobile/src/screens/Parent/TutoringForm.js`

1. **Curriculum Constants Definition**:
   Add the standard Vietnamese curriculum mapping directly in `TutoringForm.js`:
   ```javascript
   export const CURRICULUM_TIERS = {
     cap_1: {
       key: 'cap_1',
       title: 'Cấp 1 — Tiểu học',
       ageRange: '6 - 10 tuổi',
       minAge: 6,
       maxAge: 10,
       subjects: [
         { code: 'toan', name: 'Toán', icon: '📐' },
         { code: 'tieng_viet', name: 'Tiếng Việt', icon: '✍️' },
         { code: 'tu_nhien_xa_hoi', name: 'Tự nhiên và Xã hội', icon: '🌱' },
         { code: 'am_nhac', name: 'Âm nhạc', icon: '🎵' },
         { code: 'my_thuat', name: 'Mỹ thuật', icon: '🎨' },
         { code: 'tin_hoc_cong_nghe', name: 'Tin học và Công nghệ', icon: '💻' },
         { code: 'lich_su', name: 'Lịch sử', icon: '🏛️' },
         { code: 'dia_ly', name: 'Địa lý', icon: '🗺️' },
         { code: 'tieng_anh', name: 'Tiếng Anh', icon: '🇬🇧' },
         { code: 'tieng_trung', name: 'Tiếng Trung', icon: '🇨🇳' },
       ],
     },
     cap_2: {
       key: 'cap_2',
       title: 'Cấp 2 — THCS',
       ageRange: '11 - 15 tuổi',
       minAge: 11,
       maxAge: 15,
       subjects: [
         { code: 'toan', name: 'Toán', icon: '📐' },
         { code: 'ngu_van', name: 'Ngữ văn', icon: '📚' },
         { code: 'tieng_anh', name: 'Tiếng Anh', icon: '🇬🇧' },
         { code: 'tieng_trung', name: 'Tiếng Trung', icon: '🇨🇳' },
         { code: 'giao_duc_cong_dan', name: 'Giáo dục công dân', icon: '⚖️' },
         { code: 'khoa_hoc_tu_nhien', name: 'Khoa học tự nhiên', icon: '🔬' },
         { code: 'lich_su_dia_ly', name: 'Lịch sử và Địa lý', icon: '🌏' },
         { code: 'tin_hoc', name: 'Tin học', icon: '💻' },
         { code: 'cong_nghe', name: 'Công nghệ', icon: '⚙️' },
         { code: 'am_nhac', name: 'Âm nhạc', icon: '🎵' },
         { code: 'my_thuat', name: 'Mỹ thuật', icon: '🎨' },
         { code: 'hoa_hoc', name: 'Hoá học', icon: '🧪' },
         { code: 'vat_ly', name: 'Vật lý', icon: '⚡' },
         { code: 'sinh_hoc', name: 'Sinh học', icon: '🧬' },
       ],
     },
     cap_3: {
       key: 'cap_3',
       title: 'Cấp 3 — THPT',
       ageRange: '16 - 18 tuổi',
       minAge: 16,
       maxAge: 18,
       subjects: [
         { code: 'toan', name: 'Toán', icon: '📐' },
         { code: 'ngu_van', name: 'Ngữ văn', icon: '📚' },
         { code: 'tieng_anh', name: 'Tiếng Anh', icon: '🇬🇧' },
         { code: 'tieng_trung', name: 'Tiếng Trung', icon: '🇨🇳' },
         { code: 'lich_su', name: 'Lịch sử', icon: '🏛️' },
         { code: 'vat_ly', name: 'Vật lý', icon: '⚡' },
         { code: 'hoa_hoc', name: 'Hoá học', icon: '🧪' },
         { code: 'sinh_hoc', name: 'Sinh học', icon: '🧬' },
         { code: 'dia_ly', name: 'Địa lý', icon: '🗺️' },
         { code: 'giao_duc_kinh_te_phap_luat', name: 'Giáo dục kinh tế & Pháp luật', icon: '📊' },
         { code: 'tin_hoc', name: 'Tin học', icon: '💻' },
         { code: 'cong_nghe', name: 'Công nghệ', icon: '⚙️' },
         { code: 'am_nhac', name: 'Âm nhạc', icon: '🎵' },
         { code: 'my_thuat', name: 'Mỹ thuật', icon: '🎨' },
       ],
     },
   };
   ```

2. **State Management**:
   ```javascript
   const [childAge, setChildAge] = useState(8); // Default 8 years old (Cấp 1)
   const [selectedSubject, setSelectedSubject] = useState('Toán');
   const [selectedSubjectCode, setSelectedSubjectCode] = useState('toan');

   // Derive tier automatically based on age:
   const getTierForAge = (age) => {
     if (age <= 10) return CURRICULUM_TIERS.cap_1;
     if (age <= 15) return CURRICULUM_TIERS.cap_2;
     return CURRICULUM_TIERS.cap_3;
   };

   const currentTier = getTierForAge(childAge);

   // Auto-adjust selected subject if not present in new tier
   const handleAgeChange = (newAge) => {
     const clampedAge = Math.min(18, Math.max(6, newAge));
     setChildAge(clampedAge);
     const targetTier = getTierForAge(clampedAge);
     const exists = targetTier.subjects.some((s) => s.name === selectedSubject);
     if (!exists) {
       setSelectedSubject(targetTier.subjects[0].name);
       setSelectedSubjectCode(targetTier.subjects[0].code);
     }
   };
   ```

3. **Render Step 1: Child Age Stepper Component**:
   ```jsx
   {/* Section: Độ tuổi của con */}
   <View style={styles.sectionCard}>
     <View style={styles.sectionHeader}>
       <Ionicons name="person-circle-outline" size={20} color="#F26522" />
       <Text style={styles.sectionTitle}>1. Độ tuổi của con</Text>
       <View style={styles.tierBadge}>
         <Text style={styles.tierBadgeText}>{currentTier.title}</Text>
       </View>
     </View>

     <View style={styles.ageSelectorRow}>
       <TouchableOpacity
         style={styles.ageStepBtn}
         onPress={() => handleAgeChange(childAge - 1)}
         disabled={childAge <= 6}
       >
         <Ionicons name="remove" size={20} color={childAge <= 6 ? '#CBD5E1' : '#1E293B'} />
       </TouchableOpacity>

       <View style={styles.ageValueDisplay}>
         <Text style={styles.ageValueNumber}>{childAge}</Text>
         <Text style={styles.ageValueUnit}>tuổi</Text>
       </View>

       <TouchableOpacity
         style={styles.ageStepBtn}
         onPress={() => handleAgeChange(childAge + 1)}
         disabled={childAge >= 18}
       >
         <Ionicons name="add" size={20} color={childAge >= 18 ? '#CBD5E1' : '#1E293B'} />
       </TouchableOpacity>
     </View>

     {/* Quick Age Tier Buttons */}
     <View style={styles.quickTierPills}>
       <TouchableOpacity
         style={[styles.tierPill, currentTier.key === 'cap_1' && styles.tierPillActive]}
         onPress={() => handleAgeChange(8)}
       >
         <Text style={[styles.tierPillText, currentTier.key === 'cap_1' && styles.tierPillTextActive]}>
           Cấp 1 (6-10 tuổi)
         </Text>
       </TouchableOpacity>
       <TouchableOpacity
         style={[styles.tierPill, currentTier.key === 'cap_2' && styles.tierPillActive]}
         onPress={() => handleAgeChange(13)}
       >
         <Text style={[styles.tierPillText, currentTier.key === 'cap_2' && styles.tierPillTextActive]}>
           Cấp 2 (11-15 tuổi)
         </Text>
       </TouchableOpacity>
       <TouchableOpacity
         style={[styles.tierPill, currentTier.key === 'cap_3' && styles.tierPillActive]}
         onPress={() => handleAgeChange(16)}
       >
         <Text style={[styles.tierPillText, currentTier.key === 'cap_3' && styles.tierPillTextActive]}>
           Cấp 3 (16-18 tuổi)
         </Text>
       </TouchableOpacity>
     </View>
   </View>
   ```

4. **Render Step 2: Dynamic Subject Grid**:
   ```jsx
   {/* Section: Chọn môn học */}
   <View style={styles.sectionCard}>
     <View style={styles.sectionHeader}>
       <Ionicons name="book-outline" size={20} color="#F26522" />
       <Text style={styles.sectionTitle}>2. Chọn môn học cần gia sư</Text>
     </View>
     <Text style={styles.sectionSub}>
       Danh sách môn học chuẩn theo chương trình {currentTier.title}:
     </Text>

     <View style={styles.subjectGrid}>
       {currentTier.subjects.map((subj) => {
         const isSelected = selectedSubject === subj.name;
         return (
           <TouchableOpacity
             key={subj.code}
             style={[styles.subjectChip, isSelected && styles.subjectChipActive]}
             onPress={() => {
               setSelectedSubject(subj.name);
               setSelectedSubjectCode(subj.code);
             }}
             activeOpacity={0.8}
           >
             <Text style={styles.subjectIcon}>{subj.icon}</Text>
             <Text style={[styles.subjectText, isSelected && styles.subjectTextActive]}>
               {subj.name}
             </Text>
             {isSelected && (
               <Ionicons name="checkmark-circle" size={14} color="#F26522" style={{ marginLeft: 2 }} />
             )}
           </TouchableOpacity>
         );
       })}
     </View>
   </View>
   ```

5. **Payload Dispatch in `submit()`**:
   Send `child_age`, `school_level`, `subject`, and `subject_code` in the `createJob` request:
   ```javascript
   const { data: job } = await createJob({
     job_type: 'tutoring',
     subject: selectedSubject,
     child_age: childAge,
     school_level: currentTier.key,
     specific_requirements: finalRequirements,
     dates,
     time_from: timeFrom,
     time_to: timeTo,
     latitude: location.latitude,
     longitude: location.longitude,
     location_note: locationNote || location.label || 'Vị trí đã chọn trên bản đồ',
     hourly_rate_vnd: Number(rate),
   });
   ```

---

### TASK 3: Backend Schema & Gemini Service Synchronization

1. **Update `matching/services/job_schema.py`**:
   Add `child_age`, `school_level`, and `subject_code` to `OPTIONAL_BY_TYPE['tutoring']`:
   ```python
   OPTIONAL_BY_TYPE = {
       'tutoring': ['child_age', 'school_level', 'subject_code', 'tutor_seniority_preference', 'location_note'],
       'childcare': ['medical_allergy_notes', 'location_note'],
       'pickup': ['pickup_location_note', 'destination_note', 'transport_note', 'transport_method'],
   }
   ```
   Add validation in `validate_job_payload()`:
   If `child_age` is provided for tutoring, ensure it is an integer between 6 and 18.

2. **Update `matching/services/gemini_service.py`**:
   Add keyword entries to `SKILL_KEYWORDS` for all official curriculum subjects:
   ```python
   SKILL_KEYWORDS.update({
       'tu_nhien_xa_hoi': ['tự nhiên và xã hội', 'tu nhien va xa hoi', 'tnxh'],
       'tin_hoc_cong_nghe': ['tin học và công nghệ', 'tin hoc va cong nghe', 'tin học tiểu học'],
       'tin_hoc': ['tin học', 'tin hoc', 'tin', 'lập trình', 'lap trinh', 'tin học văn phòng'],
       'cong_nghe': ['công nghệ', 'cong nghe', 'môn công nghệ'],
       'giao_duc_cong_dan': ['giáo dục công dân', 'giao duc cong dan', 'gdcd'],
       'khoa_hoc_tu_nhien': ['khoa học tự nhiên', 'khoa hoc tu nhien', 'khtn'],
       'lich_su_dia_ly': ['lịch sử và địa lý', 'lich su va dia ly', 'lsdl'],
       'lich_su': ['lịch sử', 'lich su', 'sử', 'mon su'],
       'dia_ly': ['địa lý', 'dia ly', 'địa lí', 'dia li', 'mon dia'],
       'giao_duc_kinh_te_phap_luat': ['giáo dục kinh tế và pháp luật', 'ktpl', 'kinh tế pháp luật'],
       'am_nhac': ['âm nhạc', 'am nhac', 'thanh nhạc', 'hát'],
   })
   ```

3. **Update `matching/services/matching_service.py`**:
   - In `_major_match_bonus()`, ensure:
     * When `subject` is in Tier 1 (Cấp 1), give bonus to `Sư phạm Tiểu học` or `Giáo dục Tiểu học`.
     * When `subject` is `ngu_van` or `van`, match `Sư phạm Ngữ Văn`, `Văn học`, `Báo chí`.
     * When `subject` is `lich_su`, match `Sư phạm Lịch sử`, `Lịch sử`.
     * When `subject` is `dia_ly`, match `Sư phạm Địa lý`.
     * When `subject` is `hoa_hoc` / `vat_ly` / `sinh_hoc`, match respective Sư phạm and natural sciences.

---

### TASK 4: Eradicate "Cầu Giấy, Hà Nội" Fallbacks & Fix Map Centering

1. **`mobile/src/screens/Parent/TutoringForm.js` & `ChildcareForm.js`**:
   - Lines 175 & 210 in `TutoringForm.js`:
     ```javascript
     // BEFORE: location_note: locationNote || 'Cầu Giấy, Hà Nội'
     // AFTER:
     location_note: locationNote || location?.label || 'Vị trí đã chọn trên bản đồ',
     ```
   - Lines 178 & 212 in `ChildcareForm.js`: Apply the same fix.

2. **`mobile/src/components/JobLocationPicker.js`**:
   - Update default center coordinates: If the logged-in user has `user.address` or `user.latitude/longitude` (e.g. in TP. Huế), initialize map center at `user.latitude`, `user.longitude` instead of static Hanoi (`21.0278, 105.8342`).
   - If user coordinates are null, default to TP. Huế (`16.4637, 107.5908`) as the central testing city, or request device GPS.

3. **`mobile/src/screens/Parent/CandidatesListScreen.js`**:
   - Line 511: Replace hardcoded `<Text>— Phụ huynh đã sử dụng dịch vụ tại Cầu Giấy</Text>` with dynamic `<Text>— Phụ huynh tại {c.school || 'khu vực của bạn'}</Text>`.
   - Lines 210–225: When `candidates.length === 0`, DO NOT silently render Hanoi `DEMO_CANDIDATES`. Render a clean Empty State:
     * Icon: `search-outline`
     * Title: "Chưa tìm thấy gia sư phù hợp tại khu vực này"
     * Advice: "Thử mở rộng khung giờ, tăng mức học phí hoặc chọn môn học phổ biến."
     * CTA Button: "Chỉnh sửa bài đăng" → `navigation.goBack()`.

---

### TASK 5: Seed Authentic Literature & Multi-Subject CarePartners in Huế

**File**: `core/management/commands/seed_demo_data.py`

Add diverse university students from Hue University to `workers_profiles`:
1. `carepartner_van_hue`:
   - Name: Lê Thị Mai Phương
   - School: ĐH Sư Phạm - Đại học Huế
   - Major: Sư phạm Ngữ Văn (Năm 3)
   - Skills: `["van", "ngu_van", "tieng_viet", "luyen_chu_dep", "tieu_hoc", "lich_su"]`
   - ELO: 1540 (Band: Trusted), Rating: 4.95
   - Address: 32 Lê Lợi, P. Vĩnh Ninh, TP. Huế (Lat: 16.4682, Lng: 107.5895)
   - Availability: All weekdays 17:00–21:30, Weekends 08:00–21:30.
2. `carepartner_tieuhoc_hue`:
   - Name: Nguyễn Hoàng Anh Thư
   - School: ĐH Sư Phạm - Đại học Huế
   - Major: Giáo dục Tiểu học
   - Skills: `["toan", "tieng_viet", "tu_nhien_xa_hoi", "luyen_chu_dep", "am_nhac"]`
   - ELO: 1510, Rating: 4.9
   - Address: 45 Đống Đa, TP. Huế (Lat: 16.4635, Lng: 107.5912)

---

### TASK 6: Real-Time GPS Guard against Out-of-Town Dispatching

1. **Database Schema (`core/models.py`)**:
   Add fields to `core.User`:
   - `current_latitude = models.FloatField(null=True, blank=True)`
   - `current_longitude = models.FloatField(null=True, blank=True)`
   - `last_gps_updated_at = models.DateTimeField(null=True, blank=True)`
   Run `python manage.py makemigrations core` and `migrate`.

2. **Matching Engine (`matching/services/matching_service.py`)**:
   In `find_candidates()`:
   ```python
   # Prioritize real-time GPS if reported within the last 48 hours
   target_lat = user.latitude
   target_lng = user.longitude
   if user.current_latitude and user.current_longitude and user.last_gps_updated_at:
       if (timezone.now() - user.last_gps_updated_at).total_seconds() < 48 * 3600:
           target_lat = user.current_latitude
           target_lng = user.current_longitude

   km = haversine_km(job.latitude, job.longitude, target_lat, target_lng)
   # If student is currently in Hanoi (>500km from Hue job), km will be ~540km -> correctly excluded!
   if km is not None and km > max_allowed_km:
       continue
   ```

---

## 4. VERIFICATION & ACCEPTANCE CRITERIA

1. **Automated Unit Tests**:
   - Run `python manage.py test matching.tests` → **100% PASS**.
   - Add test case: Verify that a Tutoring Job with `child_age=8`, `school_level='cap_1'`, and `subject='Tiếng Việt'` matches `carepartner_tieuhoc_hue`.
   - Add test case: Verify that a student whose `current_latitude/longitude` is in Hanoi is NOT matched to a Huế job.
2. **Mobile App Unit Tests**:
   - Run `npm test` inside `mobile/` → **100% PASS**.
3. **End-to-End Manual Flow Testing**:
   - Run `python seed_data.py`.
   - Open Expo app:
     * Navigate to **Gia sư & Kèm học** (`TutoringForm`).
     * Verify age selector: Change age to `8` → Cấp 1 subjects appear (Toán, Tiếng Việt, Tự nhiên và Xã hội...).
     * Change age to `14` → Cấp 2 subjects appear (Toán, Ngữ văn, Khoa học tự nhiên, Hóa học...).
     * Change time from `18:00` to `20:30` (2.5h) and pick 3 dates → Verify bottom dock updates in real-time to: `Tạm tính (2.5h × 3 buổi): 900.000đ` (at 120.000đ/h).
     * Submit job in TP. Huế → Verify candidates list returns verified students from Huế (e.g. Lê Thị Mai Phương), with zero mentions of "Cầu Giấy, Hà Nội".
```
