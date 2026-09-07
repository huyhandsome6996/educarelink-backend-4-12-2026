// ============================================================
// Regression test — BUG #2 (QA report 2026-09-07, HEAD 8e9baf7)
// 12 màn hình Flow 1 PHẢI được import + đăng ký <Stack.Screen> trong
// AppNavigator, VÀ có ít nhất 1 nút bấm (navigation call) dẫn tới.
// Trước fix: 12 màn hình tồn tại nhưng là "dead code" — user không thể
// chạm tới tính năng ghép cặp trên app.
// ============================================================
const fs = require('fs');
const path = require('path');

const mobileRoot = path.resolve(__dirname, '..', '..');
const navSrc = fs.readFileSync(path.join(mobileRoot, 'src', 'navigation', 'AppNavigator.js'), 'utf8');

// route → [file nguồn chứa lời điều hướng tới route]
const read = (p) => fs.readFileSync(path.join(mobileRoot, 'src', ...p), 'utf8');
const INBOUND = {
  JobTypeSelect: [read(['screens', 'Parent', 'ParentHomeScreen.js'])],
  TutoringForm: [read(['screens', 'Parent', 'JobTypeSelectScreen.js'])],
  ChildcareForm: [read(['screens', 'Parent', 'JobTypeSelectScreen.js'])],
  PickupForm: [read(['screens', 'Parent', 'JobTypeSelectScreen.js'])],
  CandidatesList: [
    read(['screens', 'Parent', 'TutoringForm.js']),
    read(['screens', 'Parent', 'ChildcareForm.js']),
    read(['screens', 'Parent', 'PickupForm.js']),
    read(['screens', 'Parent', 'ParentHomeScreen.js']),
  ],
  CandidateProfileV2: [read(['screens', 'Parent', 'CandidatesListScreen.js'])],
  BookingDetail: [
    read(['screens', 'Parent', 'CandidateProfileV2Screen.js']),
    read(['screens', 'Worker', 'MyBookingsScreen.js']),
    read(['screens', 'Parent', 'ParentHomeScreen.js']),
  ],
  WalletCredits: [read(['screens', 'Parent', 'ParentHomeScreen.js'])],
  MatchingAvailability: [
    read(['screens', 'Worker', 'WorkerProfileScreen.js']),
    read(['screens', 'Worker', 'WorkerFeedScreen.js']),
  ],
  Blackout: [
    read(['screens', 'Worker', 'WorkerProfileScreen.js']),
    read(['screens', 'Worker', 'WorkerFeedScreen.js']),
  ],
  MyBookings: [
    read(['screens', 'Worker', 'WorkerProfileScreen.js']),
    read(['screens', 'Worker', 'WorkerFeedScreen.js']),
  ],
  Appeal: [read(['screens', 'Worker', 'MyBookingsScreen.js'])],
};

const ROUTES = Object.keys(INBOUND);

describe('AppNavigator — 12 màn hình Flow 1 phải được nối (BUG #2)', () => {
  test.each(ROUTES)('route "%s" được đăng ký <Stack.Screen>', (route) => {
    const re = new RegExp(`<Stack\\.Screen\\s+name="${route}"\\s+component=`);
    expect(navSrc).toMatch(re);
  });

  test.each(ROUTES)('route "%s" có component được import đúng file', (route) => {
    const importMap = {
      JobTypeSelect: '../screens/Parent/JobTypeSelectScreen',
      TutoringForm: '../screens/Parent/TutoringForm',
      ChildcareForm: '../screens/Parent/ChildcareForm',
      PickupForm: '../screens/Parent/PickupForm',
      CandidatesList: '../screens/Parent/CandidatesListScreen',
      CandidateProfileV2: '../screens/Parent/CandidateProfileV2Screen',
      BookingDetail: '../screens/Parent/BookingDetailScreen',
      WalletCredits: '../screens/Parent/WalletScreen',
      MatchingAvailability: '../screens/Worker/AvailabilityScreen',
      Blackout: '../screens/Worker/BlackoutScreen',
      MyBookings: '../screens/Worker/MyBookingsScreen',
      Appeal: '../screens/Worker/AppealScreen',
    };
    const re = new RegExp(`import\\s+\\w+\\s+from\\s+'${importMap[route]}'`);
    expect(navSrc).toMatch(re);
  });

  test.each(ROUTES)('route "%s" có ít nhất 1 lời điều hướng inbound', (route) => {
    const sources = INBOUND[route];
    const anyRef = sources.some((src) => src.includes(`'${route}'`));
    expect(anyRef).toBe(true);
  });

  test('file màn hình thật sự tồn tại trên đĩa (không import ảo)', () => {
    const files = [
      'src/screens/Parent/JobTypeSelectScreen.js',
      'src/screens/Parent/TutoringForm.js',
      'src/screens/Parent/ChildcareForm.js',
      'src/screens/Parent/PickupForm.js',
      'src/screens/Parent/CandidatesListScreen.js',
      'src/screens/Parent/CandidateProfileV2Screen.js',
      'src/screens/Parent/BookingDetailScreen.js',
      'src/screens/Parent/WalletScreen.js',
      'src/screens/Worker/AvailabilityScreen.js',
      'src/screens/Worker/BlackoutScreen.js',
      'src/screens/Worker/MyBookingsScreen.js',
      'src/screens/Worker/AppealScreen.js',
    ];
    for (const f of files) {
      expect(fs.existsSync(path.join(mobileRoot, f))).toBe(true);
    }
  });
});
