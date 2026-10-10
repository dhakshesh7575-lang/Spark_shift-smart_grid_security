export function isE164(n) {
  return typeof n === 'string' && /^\+[1-9]\d{1,14}$/.test(n);
}

export function parseAdminNumbers(str) {
  if (!str || typeof str !== 'string') return [];
  return str
    .split(',')
    .map(n => n.trim())
    .filter(n => n.length > 0)
    .filter(isE164)
    .filter((v, i, a) => a.indexOf(v) === i);
}

export function getAdminsFromEnv() {
  return parseAdminNumbers(process.env.WHATSAPP_ADMIN_NUMBERS || '');
}
