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

/** Returns the decrypted bundle object. Throws WrongPasscode on a bad passcode. */
export async function unlock(passcode) {
  const env = await fetchEnvelope();
  const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64(env.salt), iterations: env.iter },
    keyMat, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(env.iv) }, key, b64(env.ct));
  } catch {
    throw new WrongPasscode('Wrong passcode');
  }
  const buf = env.gzip ? await gunzip(plain) : plain;
  return JSON.parse(new TextDecoder().decode(buf));
}
