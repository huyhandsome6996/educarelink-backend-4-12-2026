/**
 * Test: DB pricing_type phải thắng khi khác với local hard-code.
 * Bug A1-01: ...localCat spread ghi đè pricingType từ DB.
 *
 * Chạy: npx jest mobile/src/screens/Parent/__tests__/CreateTaskScreen.pricingType.test.js
 */

// ---- Logic thuần — không cần import component React ----
// Trích chính xác logic từ CreateTaskScreen.js để test độc lập.

const CATEGORIES = [
  { id: 1, iconName: 'book', name: 'Gia sư', hint: '150k-300k', pricingType: 'hourly' },
  { id: 6, iconName: 'restaurant', name: 'Nấu ăn', hint: '100k-200k', pricingType: 'hourly' },
  { id: 7, iconName: 'hardware-chip', name: 'Hỗ trợ AI', hint: 'Thoả thuận', pricingType: 'fixed' },
  { id: 8, iconName: 'apps', name: 'Khác', hint: 'Thoả thuận', pricingType: 'fixed' },
];

/** Logic FIX (hiện tại trong CreateTaskScreen.js) */
function buildCatFixed(selectedCat, dbCategories) {
  const dbCat = dbCategories.find(c => c.id === selectedCat);
  const localCat = CATEGORIES.find(c => c.id === selectedCat);
  return {
    id: selectedCat,
    name: dbCat?.name ?? localCat?.name,
    hint: localCat?.hint,
    pricingType: dbCat?.pricing_type ?? localCat?.pricingType ?? 'fixed',
  };
}

/** Logic BUG CŨ (để chứng minh nó sai) */
function buildCatBuggy(selectedCat, dbCategories) {
  const dbCat = dbCategories.find(c => c.id === selectedCat);
  const localCat = CATEGORIES.find(c => c.id === selectedCat);
  const cat = {
    id: selectedCat,
    pricingType: dbCat?.pricing_type || localCat?.pricingType || 'fixed',
    ...dbCat,
    ...localCat, // <-- spread này ghi đè pricingType bằng localCat.pricingType
  };
  return cat;
}

describe('A1-01: pricing_type source of truth — DB phải thắng hard-code', () => {
  // Giả lập admin đổi "Nấu ăn" (id=6) từ hourly → fixed trên DB
  const dbCategories = [
    { id: 6, name: 'Nấu ăn', pricing_type: 'fixed' }, // DB nói fixed
  ];

  it('logic CŨ (bug) sai: localCat.pricingType ghi đè DB', () => {
    const cat = buildCatBuggy(6, dbCategories);
    // Bug: pricingType = 'hourly' (từ local hard-code), KHÔNG phải 'fixed' (DB)
    expect(cat.pricingType).toBe('hourly'); // <-- chứng minh BUG
  });

  it('logic MỚI (fix) đúng: DB pricing_type thắng', () => {
    const cat = buildCatFixed(6, dbCategories);
    expect(cat.pricingType).toBe('fixed'); // <-- DB thắng
  });

  it('name ưu tiên DB khi có', () => {
    const cat = buildCatFixed(6, dbCategories);
    expect(cat.name).toBe('Nấu ăn');
  });

  it('hint giữ từ local fallback (chỉ có ở CATEGORIES)', () => {
    const cat = buildCatFixed(6, dbCategories);
    expect(cat.hint).toBe('100k-200k');
  });

  it('fallback đúng khi DB không trả data (mất mạng)', () => {
    const cat = buildCatFixed(6, []); // dbCategories rỗng
    expect(cat.pricingType).toBe('hourly'); // fallback local
    expect(cat.name).toBe('Nấu ăn');
  });

  it('fallback cuối cùng là fixed khi không có DB và local', () => {
    const cat = buildCatFixed(999, []); // id không tồn tại
    expect(cat.pricingType).toBe('fixed');
  });
});
