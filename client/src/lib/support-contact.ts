export const COTALA_SUPPORT_EMAIL = "info@cotala.com";
export const COTALA_SUPPORT_PHONE = "604-514-9589";

export function normalizeSupportEmail(value?: string | null): string {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "test@test.com") return COTALA_SUPPORT_EMAIL;
  return trimmed;
}

export function normalizeSupportPhone(value?: string | null): string {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "test@test.com") return COTALA_SUPPORT_PHONE;
  return trimmed;
}
