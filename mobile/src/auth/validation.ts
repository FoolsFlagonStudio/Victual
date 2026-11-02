// Client-side checks that mirror the backend's @Valid rules (SignupRequest etc.)
// so most mistakes are caught before a round trip.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Letters are told apart by case (works for accented letters too, like the backend's Character checks).
const isUpper = (c: string) => c !== c.toLowerCase();
const isLower = (c: string) => c !== c.toUpperCase();
const isLetter = (c: string) => c.toLowerCase() !== c.toUpperCase();
const isDigit = (c: string) => c >= '0' && c <= '9';
const utf8Length = (v: string) => encodeURIComponent(v).replace(/%[0-9A-F]{2}/gi, 'x').length;

/** The rules a new password must meet, in the order the checklist shows them. */
export const PASSWORD_RULES: { key: string; label: string; message: string; test: (v: string) => boolean }[] = [
  { key: 'length', label: '8+ characters', message: 'Use 8 to 72 characters.', test: (v) => v.length >= 8 && utf8Length(v) <= 72 },
  { key: 'upper', label: 'Uppercase letter', message: 'Add an uppercase letter.', test: (v) => [...v].some(isUpper) },
  { key: 'lower', label: 'Lowercase letter', message: 'Add a lowercase letter.', test: (v) => [...v].some(isLower) },
  { key: 'number', label: 'Number', message: 'Add a number.', test: (v) => [...v].some(isDigit) },
  { key: 'symbol', label: 'Symbol', message: 'Add a symbol, like ! or #.', test: (v) => [...v].some((c) => !isLetter(c) && !isDigit(c)) },
];

const COMMON = new Set(['password', 'passw', 'qwerty', 'qwertyuiop', 'letmein', 'welcome', 'admin', 'iloveyou', 'monkey', 'dragon', 'football', 'baseball', 'sunshine', 'princess', 'abc', 'abcd', 'abcdef', 'test', 'login', 'victual', 'forkast']);

/** Built on a common word ("Password1!", "P@ssw0rd!23"), or one letter repeated. Same as the backend. */
export function isCommonPassword(v: string): boolean {
  const lower = v.toLowerCase();
  const letters = lower.replace(/[^a-z]/g, '');
  const unswapped = lower.replace(/@/g, 'a').replace(/0/g, 'o').replace(/1/g, 'l').replace(/3/g, 'e').replace(/\$/g, 's').replace(/[^a-z]/g, '');
  if (COMMON.has(letters) || COMMON.has(unswapped)) return true;
  if ([...COMMON].some((w) => w.length >= 5 && (letters.includes(w) || unswapped.includes(w)))) return true;
  return /^(.)\1*$/.test(letters);
}

export const validate = {
  required: (v: string, label: string) => (v.trim() ? null : `${label} is required.`),
  name: (v: string, label: string) =>
    !v.trim() ? `${label} is required.` : v.trim().length > 100 ? `${label} must be 100 characters or fewer.` : null,
  email: (v: string) =>
    !v.trim() ? 'Email is required.' : EMAIL.test(v.trim()) ? null : 'Enter a valid email address.',
  /** A new password (sign up, reset, change). Mirrors the backend's @StrongPassword. */
  password: (v: string) => {
    if (!v) return 'Password is required.';
    const missing = PASSWORD_RULES.find((r) => !r.test(v));
    if (missing) return missing.message;
    if (v.trim() !== v) return "Passwords can't start or end with a space.";
    if (isCommonPassword(v)) return 'That password is too easy to guess. Try something less common.';
    return null;
  },
  match: (v: string, other: string) => (v === other ? null : "Passwords don't match."),
  code: (v: string) => (/^\d{6}$/.test(v) ? null : 'Enter the 6-digit code.'),
};

/** Returns only the fields that have an error. */
export function collectErrors<K extends string>(checks: Record<K, string | null>) {
  return Object.fromEntries(Object.entries(checks).filter(([, v]) => v)) as Partial<Record<K, string>>;
}
