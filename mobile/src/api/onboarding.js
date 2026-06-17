import apiClient from './client';

// ====================================================================
// ONBOARDING API — đồng bộ với web (onboarding_parent.html, onboarding_worker.html)
// ====================================================================

// Đánh dấu đã hoàn thành onboarding (first_login = false)
// Body tuỳ chọn: { phone_number?, address?, latitude?, longitude? }
export const completeOnboarding = (payload = {}) =>
  apiClient.post('/onboarding/complete/', payload);
