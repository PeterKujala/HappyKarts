const { DomainError } = require('../domain/errors');
const { bytesToBase64, base64ToBytes } = require('./bytes');

const READABLE_CODE = /^[a-z0-9]{4,32}$/;

const CODE_KEY_INFO = 'kartboard.code-key.v1';
const SESSION_SECRET_INFO = 'kartboard.session-secret.code.v1';
const encoder = new TextEncoder();
const salt = encoder.encode('kartboard-access-code');

async function deriveAesKey(secret, info) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(info) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Prefer KARTBOARD_CODE_KEY. Otherwise derive a different key from the session secret.
 * @param {{ codeKey?: string, sessionSecret?: string }} material
 */
async function sealingKey(material = {}) {
  const codeKey = String(material.codeKey || '');
  const sessionSecret = String(material.sessionSecret || '');
  if (codeKey) return { key: await deriveAesKey(codeKey, CODE_KEY_INFO), source: 'code-key' };
  if (sessionSecret) return { key: await deriveAesKey(sessionSecret, SESSION_SECRET_INFO), source: 'session-secret' };
  return null;
}

async function sealCode(code, material) {
  const sealing = await sealingKey(material);
  if (!sealing) throw new DomainError('NOT_CONFIGURED', 'KartBoard has no key for storing access codes.', 503);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sealing.key, encoder.encode(code)));
  return { codeIv: bytesToBase64(iv), codeCipher: bytesToBase64(cipher) };
}

async function openCode(record, material) {
  if (!record || typeof record.codeIv !== 'string' || typeof record.codeCipher !== 'string' || !record.codeIv || !record.codeCipher) return null;
  const sealing = await sealingKey(material);
  if (!sealing) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(record.codeIv) },
      sealing.key,
      base64ToBytes(record.codeCipher)
    );
    const code = new TextDecoder().decode(plain);
    return READABLE_CODE.test(code) ? code : null;
  } catch {
    return null;
  }
}

module.exports = { CODE_KEY_INFO, SESSION_SECRET_INFO, sealingKey, sealCode, openCode };
