function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlToBytes(text) {
  const padded = text.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  return base64ToBytes(padded);
}

function timingSafeEqual(left, right) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array) || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function timingSafeEqualText(left, right) {
  const encoder = new TextEncoder();
  const a = encoder.encode(String(left));
  const b = encoder.encode(String(right));
  const length = Math.max(a.length, b.length, 1);
  const leftBytes = new Uint8Array(length);
  const rightBytes = new Uint8Array(length);
  leftBytes.set(a.subarray(0, length));
  rightBytes.set(b.subarray(0, length));
  return a.length === b.length && timingSafeEqual(leftBytes, rightBytes);
}

module.exports = { bytesToBase64, base64ToBytes, bytesToBase64Url, base64UrlToBytes, timingSafeEqual, timingSafeEqualText };
