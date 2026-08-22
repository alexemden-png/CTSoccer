// RFC 6238 TOTP (HMAC-SHA1, 30-second step, 6 digits), shared by account.html
// (setup) and login.html (the actual sign-in challenge). HMAC-SHA1 runs on the
// browser's native Web Crypto (crypto.subtle) — no external crypto library.
// Loaded as a plain global script, matching the rest of the site's convention
// (auth.js, club-match.js) rather than an ES module.

const TOTP_STEP_SECONDS = 30;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes) {
  let bits = '';
  for (let i = 0; i < bytes.length; i++) bits += bytes[i].toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    let chunk = bits.slice(i, i + 5);
    if (chunk.length < 5) chunk = chunk.padEnd(5, '0');
    out += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return out;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_ALPHABET.indexOf(clean[i]);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(bytes);
}

// 80-bit secret (10 random bytes -> 16 base32 chars) — the standard length
// used by Google Authenticator, Authy, 1Password, etc. Real CSPRNG, not
// Math.random() (which the earlier cosmetic version used).
function generateTotpSecret() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

// 8-byte big-endian counter, per RFC 4226. JS numbers are exact up to 2^53,
// far beyond any counter value we'll see for centuries, so this is safe.
function counterToBytes(counter) {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  view.setUint32(0, high);
  view.setUint32(4, low);
  return new Uint8Array(buf);
}

async function hmacSha1(keyBytes, messageBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, messageBytes);
  return new Uint8Array(sig);
}

// timeStepOffset lets callers check the previous/next 30s window for clock
// drift (see verifyTotpCode). timestampMs is injectable for testing.
async function computeTotpCode(secretBase32, timeStepOffset, timestampMs) {
  timeStepOffset = timeStepOffset || 0;
  timestampMs = timestampMs === undefined ? Date.now() : timestampMs;
  const counter = Math.floor(timestampMs / 1000 / TOTP_STEP_SECONDS) + timeStepOffset;
  const keyBytes = base32Decode(secretBase32);
  const counterBytes = counterToBytes(counter);
  const digest = await hmacSha1(keyBytes, counterBytes);
  const offset = digest[19] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, '0');
}

// Accepts the current step plus one step either side (±30s) — the standard
// clock-drift allowance for TOTP.
async function verifyTotpCode(secretBase32, enteredCode, driftSteps) {
  driftSteps = driftSteps === undefined ? 1 : driftSteps;
  const clean = String(enteredCode || '').trim();
  if (!/^\d{6}$/.test(clean)) return false;
  for (let offset = -driftSteps; offset <= driftSteps; offset++) {
    const code = await computeTotpCode(secretBase32, offset);
    if (code === clean) return true;
  }
  return false;
}

// CSPRNG backup codes, formatted XXXX-XXXX. Each caller is responsible for
// tracking which ones have been used (see account.html/login.html).
function generateBackupCodes(count) {
  count = count || 8;
  const codes = [];
  for (let i = 0; i < count; i++) {
    const bytes = new Uint8Array(5);
    crypto.getRandomValues(bytes);
    const b32 = base32Encode(bytes).slice(0, 8);
    codes.push(b32.slice(0, 4) + '-' + b32.slice(4, 8));
  }
  return codes;
}

function totpOtpauthUri(secretBase32, email, issuer) {
  const label = encodeURIComponent(issuer + ':' + email);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: 'SHA1', digits: '6', period: String(TOTP_STEP_SECONDS) });
  return 'otpauth://totp/' + label + '?' + params.toString();
}
