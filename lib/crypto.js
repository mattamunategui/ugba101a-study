// Passcode -> key -> decrypt the content bundle (PBKDF2-SHA256, AES-GCM-256, gzip).
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let envelopePromise = null;
function fetchEnvelope() {
  envelopePromise ||= fetch('data/bundle.enc', { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error('Could not load content (HTTP ' + r.status + ').');
    return r.json();
  }).catch((e) => { envelopePromise = null; throw e; });
  return envelopePromise;
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export class WrongPasscode extends Error {}

async function passKey(passcode, salt, iter) {
  const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(salt), iterations: iter },
    keyMat, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}

/** Returns the decrypted bundle object. Throws WrongPasscode on a bad passcode.
 *  v2 envelopes wrap one content key per passcode; `currentOnly` (the gate form) ignores retired passcodes,
 *  which still open the hub for browsers that saved them earlier. */
export async function unlock(passcode, currentOnly = false) {
  const env = await fetchEnvelope();
  let key = null;
  if (env.v === 2) {
    for (const k of env.keys.filter((k) => k.current || !currentOnly)) {
      try {
        const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(k.iv) }, await passKey(passcode, k.salt, env.iter), b64(k.wk));
        key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
        break;
      } catch { /* not this passcode */ }
    }
    if (!key) throw new WrongPasscode('Wrong passcode');
  } else key = await passKey(passcode, env.salt, env.iter);
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(env.iv) }, key, b64(env.ct));
  } catch {
    throw new WrongPasscode('Wrong passcode');
  }
  const buf = env.gzip ? await gunzip(plain) : plain;
  return JSON.parse(new TextDecoder().decode(buf));
}
