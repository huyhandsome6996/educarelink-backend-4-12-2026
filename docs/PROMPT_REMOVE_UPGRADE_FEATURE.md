# TASK SPECIFICATION: PERMANENTLY REMOVE "UPGRADE PARENT TO CAREPARTNER" FEATURE & ENFORCE STRICT ROLE ISOLATION (SEPARATE ACCOUNTS FOR PARENT VS CAREPARTNER)

---

## 1. EXECUTIVE SUMMARY & BUSINESS CONTEXT

### 1.1 The Platform
- **Project**: EduCareLink — A Vietnamese on-demand caregiving and tutoring connection platform.
- **Tech Stack**:
  - **Backend**: Python 3.11 / Django 5.2.15 + Django REST Framework (DRF) + SimpleJWT.
  - **Web Frontend**: Server-rendered Django Templates with vanilla JavaScript and Tailwind CSS.
  - **Mobile**: React Native 0.81.5 / Expo SDK 54 (`mobile/`).
- **Core Entities**:
  - `User.role`: Either `'parent'` or `'worker'` (CarePartner).
  - **Parent**: Automatically verified/approved upon registration (`is_approved=True`). Posts jobs, manages escrow payments, books candidates, and rates workers.
  - **CarePartner (Worker)**: Requires manual admin audit of ID card (front/back), selfie photo, and qualifications (`is_approved=False` until vetted). Applies to jobs, performs shifts, earns income, and maintains an ELO rating.

### 1.2 The Problem
In the legacy codebase, an in-app "upgrade" mechanism was introduced:
- A logged-in Parent user could open a modal on their dashboard or profile, upload their National ID card (CCCD), selfie, and certificate, and trigger `POST /api/auth/upgrade-carepartner/`.
- Once an administrator approved this request, the user's `role` field was flipped from `'parent'` to `'worker'`.

This architectural shortcut introduces critical business conflicts and data contamination:
1. **Contaminated Audit Trails**: A single `User` record holds conflicting transaction histories (posted jobs vs applied jobs, parent escrow debits vs worker payout credits, parent reviews vs worker ratings).
2. **Permission Leaks & Routing Complexity**: Dual-purpose accounts cause race conditions in role-based middleware, navigation guards, and notifications.
3. **UX Clutter**: Pure parent users are distracted by persistent "Become a CarePartner" banners, modals, and pending status checks.

### 1.3 The Goal
**Enforce 100% strict role exclusivity and separate accounts:**
1. An account registered as a **Parent** remains a Parent forever. It can **NEVER** be upgraded or converted to a CarePartner.
2. A Parent who wishes to work as a CarePartner **MUST** log out and register a brand new, dedicated CarePartner account with their own credentials.
3. **Completely rip out** the upgrade mechanism across all three tiers: Backend (DRF views/routes), Web Frontend (templates/scripts/modals), and Mobile (Expo screens/navigation/API clients).

---

## 2. EXHAUSTIVE FILE AUDIT & REQUIRED CHANGES

### 2.1 Backend: Django & DRF (`core/`)

#### A. File: `core/oauth_views.py`
- **Current State**:
  - `class UpgradeToCarepartnerAPIView(APIView)` (lines ~369–474): Handles `POST /api/auth/upgrade-carepartner/` with multipart file upload (`id_card_front`, `id_card_back`, `selfie_photo`, `certificate_photo`).
  - `class UpgradeStatusAPIView(APIView)` (lines ~476–505): Handles `GET /api/auth/upgrade-status/` returning `{ "can_upgrade": bool, "is_pending": bool, "is_approved": bool }`.
- **Required Action**:
  - Option 1 (Recommended): Remove both classes entirely.
  - Option 2 (Defensive backwards-compatibility): If existing mobile app builds might still call these endpoints, return an explicit HTTP 400 Bad Request with a clear message:
    ```python
    return Response(
        {"detail": "Chức năng nâng cấp đã ngừng hoạt động. Vui lòng đăng ký tài khoản CarePartner riêng biệt."},
        status=status.HTTP_400_BAD_REQUEST
    )
    ```

#### B. File: `core/urls.py`
- **Current State**:
  ```python
  from .oauth_views import (
      ...,
      UpgradeToCarepartnerAPIView,
      UpgradeStatusAPIView,
  )

  urlpatterns = [
      ...
      path('auth/upgrade-carepartner/', UpgradeToCarepartnerAPIView.as_view(), name='upgrade-carepartner'),
      path('auth/upgrade-status/', UpgradeStatusAPIView.as_view(), name='upgrade-status'),
      ...
  ]
  ```
- **Required Action**:
  - Remove imports of `UpgradeToCarepartnerAPIView` and `UpgradeStatusAPIView`.
  - Remove both URL patterns (`auth/upgrade-carepartner/` and `auth/upgrade-status/`).

#### C. File: `core/views.py`
- **Inspect `AdminApprovalAPIView`**:
  - Ensure that admin approval logic only applies to newly registered pending worker accounts (`role='worker', is_approved=False`).
  - Remove any legacy condition that checks for `user.role == 'parent'` being promoted to `'worker'`.

#### D. Documentation: `AGENTS.md`
- **File**: `AGENTS.md`
- **Required Action**:
  - Update Section **6.1 (Auth & User Endpoints)**: Remove `/api/auth/upgrade-carepartner/` and `/api/auth/upgrade-status/` from the table.
  - Remove references stating that parents can upgrade to carepartners.

---

### 2.2 Web Frontend: Django Templates (`frontend/`)

#### A. File: `frontend/templates/frontend/parent_home.html`
- **Current State**:
  - Lines ~825–930: Modal container `<div id="upgrade-modal" class="fixed inset-0 ...">` containing file upload inputs for ID card front/back, selfie, and certificate.
  - Lines ~933–995: JavaScript modal handler functions:
    - `openUpgradeModal()`
    - `closeUpgradeModal()`
    - `submitUpgrade(e)`
  - Lines ~996–1025: Polling/checking function:
    - `checkUpgradeStatus()`
    - DOM element toggles for `#upgrade-section` and `#upgrade-pending-section`.
    - Auto-execution: `checkUpgradeStatus()` called on DOM load.
- **Required Action**:
  1. Delete the entire HTML block for `<div id="upgrade-modal">...</div>`.
  2. Delete any banner or card with `id="upgrade-section"` or `id="upgrade-pending-section"`.
  3. Delete JavaScript functions `openUpgradeModal`, `closeUpgradeModal`, `submitUpgrade`, and `checkUpgradeStatus`.
  4. Remove the invocation `checkUpgradeStatus()` from initial page script setup.

#### B. File: `frontend/templates/frontend/parent_profile.html`
- **Current State**:
  - Lines ~241–255: `<section id="upgrade-section" ...>` showcasing "Nâng cấp tài khoản CarePartner".
  - Lines ~490–496: JavaScript toggling:
    ```javascript
    if (user.role === 'parent' && !user.is_verified) {
        document.getElementById('upgrade-section').style.display = 'flex';
    }
    ```
- **Required Action**:
  1. Delete `<section id="upgrade-section">` HTML markup.
  2. Delete the JavaScript lines referencing and displaying `#upgrade-section`.

#### C. File: `frontend/templates/frontend/register.html`
- **Verification & Reinforcement**:
  - Confirm that the dual-role selection tabs (Parent vs CarePartner) are distinct and prominent.
  - When the user selects **Parent**: Direct registration for families seeking care/tutoring.
  - When the user selects **CarePartner**: Mandatory identity verification (ID card, selfie, certifications) for individuals applying to work.
  - Ensure there is no ambiguity: users understand they are creating a dedicated account for that specific role.

---

### 2.3 Mobile App: React Native / Expo (`mobile/`)

#### A. File: `mobile/src/api/auth.js`
- **Current State**:
  ```javascript
  export const upgradeToCarepartner = (formData) =>
    apiClient.post('/auth/upgrade-carepartner/', formData, { ... });

  export const getUpgradeStatus = () => apiClient.get('/auth/upgrade-status/');
  ```
- **Required Action**:
  - Remove both exports (`upgradeToCarepartner` and `getUpgradeStatus`).

#### B. File: `mobile/src/screens/Parent/ParentProfileScreen.js`
- **Current State**:
  - Contains a profile menu item or banner triggering:
    ```javascript
    onPress={() => navigation.navigate('UpgradeToCarepartner')}
    ```
- **Required Action**:
  - Delete this menu item/button.

#### C. File: `mobile/src/screens/Parent/UpgradeToCarepartnerScreen.js`
- **Required Action**:
  - Delete the entire file `UpgradeToCarepartnerScreen.js`.

#### D. File: `mobile/src/navigation/AppNavigator.js`
- **Current State**:
  - Imports `UpgradeToCarepartnerScreen`.
  - Declares `<Stack.Screen name="UpgradeToCarepartner" component={UpgradeToCarepartnerScreen} ... />`.
- **Required Action**:
  - Remove import statement for `UpgradeToCarepartnerScreen`.
  - Remove `<Stack.Screen name="UpgradeToCarepartner" ... />`.

---

## 3. STEP-BY-STEP IMPLEMENTATION PLAN FOR CODING AGENT

```
Step 1: Backend Cleanup
  ├── Remove UpgradeToCarepartnerAPIView and UpgradeStatusAPIView from core/oauth_views.py
  ├── Unbind endpoints in core/urls.py
  └── Verify core/views.py (AdminApprovalAPIView)

Step 2: Web Frontend Cleanup
  ├── Remove #upgrade-modal and CTA sections in frontend/templates/frontend/parent_home.html
  ├── Remove upgrade JS functions (openUpgradeModal, submitUpgrade, checkUpgradeStatus)
  └── Remove #upgrade-section in frontend/templates/frontend/parent_profile.html

Step 3: Mobile App Cleanup
  ├── Remove API methods in mobile/src/api/auth.js
  ├── Remove menu entry in mobile/src/screens/Parent/ParentProfileScreen.js
  ├── Remove screen registration in mobile/src/navigation/AppNavigator.js
  └── Delete mobile/src/screens/Parent/UpgradeToCarepartnerScreen.js

Step 4: Quality Assurance & Validation
  ├── Run `python manage.py check` (0 issues)
  ├── Run `python -X utf8 scripts/check_no_hardcoded_paths.py` (PASS)
  ├── Run tests `python manage.py test core`
  └── Git commit & push
```

---

## 4. VERIFICATION CRITERIA & ACCEPTANCE TESTS

1. **Syntax & System Check**:
   ```bash
   python manage.py check
   ```
   Must exit with code 0 and zero warnings.

2. **Route Invalidation**:
   - Sending `POST /api/auth/upgrade-carepartner/` with a valid Parent JWT token must return `404 Not Found` (or `400 Bad Request` if deprecated with error message).
   - Sending `GET /api/auth/upgrade-status/` must return `404 Not Found`.

3. **Parent Web UI Cleanliness**:
   - Access `http://127.0.0.1:8000/phu-huynh/` as `phuhuynh_test`:
     - Inspect DOM: zero occurrences of `upgrade-modal`, `upgrade-section`, `upgrade-pending-section`.
     - Browser console: zero failed network requests to `/api/auth/upgrade-status/`.
   - Access `http://127.0.0.1:8000/phu-huynh/ho-so/`:
     - No "Nâng cấp tài khoản" banner or action button visible.

4. **Dedicated Registration Preserved**:
   - Access `http://127.0.0.1:8000/dang-ky/`:
     - Registering as Parent creates a clean `role='parent', is_approved=True` account.
     - Registering as CarePartner creates a `role='worker', is_approved=False` account awaiting admin review.

5. **Commit Message Format (Vietnamese mandatory per AGENTS.md)**:
   ```bash
   git commit -m "refactor(auth): loai bo hoan toan tinh nang nang cap phu huynh thanh carepartner, tach biet tai khoan doc lap"
   ```
