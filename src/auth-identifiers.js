// SURA-only authentication identifiers. All identities remain unverified without OTP.
// Require international dialing codes except for Bangladesh's common 01xxxxxxxxx format.
// Never guess an international dialing code for an arbitrary national number.
export function normalizePhone(input) {
  if (typeof input !== 'string' || input.length > 40) return null;
  const compact = input.trim().replace(/[\s().-]/g, '');
  if (/^01[3-9]\d{8}$/.test(compact)) return '+88' + compact;
  if (/^8801[3-9]\d{8}$/.test(compact)) return '+' + compact;
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}

export function normalizeEmail(input) {
  if (typeof input !== 'string' || input.length > 256) return null;
  const email = input.trim().toLowerCase();
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,20}$/.test(email)) return null;
  // Internal, non-routable identifiers used to preserve the legacy NOT NULL column.
  if (email.endsWith('@phone.sura.invalid')) return null;
  return email;
}

export function isAllowedPassword(password) {
  return typeof password === 'string' && (
    /^\d{8}$/.test(password) ||
    (password.length >= 10 && password.length <= 64 &&
     /[A-Za-z]/.test(password) && /[0-9]/.test(password) &&
     !/[\x00-\x1f\x7f]/.test(password))
  );
}

export function phoneOnlyCredentialEmail(userId) {
  if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId)) throw Error('invalid_account_id');
  return 'phone-' + userId + '@phone.sura.invalid';
}

export function isPhoneOnlyCredentialEmail(email) {
  return typeof email === 'string' && /^phone-[0-9a-f-]{36}@phone\.sura\.invalid$/i.test(email);
}
