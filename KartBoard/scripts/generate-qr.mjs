import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const QRCode = require('qrcode');
const { PUBLIC_BOARD_URL, CONTROLLER_URL } = require('../src/http/constants.js');

const root = path.resolve(import.meta.dirname, '..');

function renderLabeled(qr, label) {
  const cell = 12;
  const quiet = 4;
  const size = (qr.modules.size + quiet * 2) * cell;
  const labelHeight = 56;
  const pixels = Buffer.alloc((size + labelHeight) * size, 255);
  for (let y = 0; y < qr.modules.size; y += 1) {
    for (let x = 0; x < qr.modules.size; x += 1) {
      if (!qr.modules.get(x, y)) continue;
      for (let dy = 0; dy < cell; dy += 1) {
        for (let dx = 0; dx < cell; dx += 1) {
          const px = (x + quiet) * cell + dx;
          const py = (y + quiet) * cell + dy;
          pixels[py * size + px] = 23;
        }
      }
    }
  }
  drawText(pixels, size, size + labelHeight, label, size, labelHeight);
  return png(size, size + labelHeight, pixels);
}

function sideBySide(left, right) {
  const leftInfo = decodePngSize(left);
  const rightInfo = decodePngSize(right);
  const gap = 48;
  const width = leftInfo.width + gap + rightInfo.width;
  const height = Math.max(leftInfo.height, rightInfo.height);
  const pixels = Buffer.alloc(width * height, 255);
  blit(pixels, width, decodeGray(left), leftInfo.width, leftInfo.height, 0, 0);
  blit(pixels, width, decodeGray(right), rightInfo.width, rightInfo.height, leftInfo.width + gap, 0);
  return png(width, height, pixels);
}

function blit(target, targetWidth, source, sourceWidth, sourceHeight, offsetX, offsetY) {
  for (let y = 0; y < sourceHeight; y += 1) {
    for (let x = 0; x < sourceWidth; x += 1) target[(offsetY + y) * targetWidth + offsetX + x] = source[y * sourceWidth + x];
  }
}

function drawText(pixels, width, height, text, bandWidth, bandHeight) {
  const scale = 3;
  const glyphWidth = 5 * scale;
  const textWidth = text.length * (glyphWidth + scale);
  let cursor = Math.floor((bandWidth - textWidth) / 2);
  const top = height - bandHeight + Math.floor((bandHeight - 7 * scale) / 2);
  for (const character of text) {
    const glyph = FONT[character] || FONT[' '];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        if (!((glyph[row] >> (4 - col)) & 1)) continue;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const x = cursor + col * scale + dx;
            const y = top + row * scale + dy;
            if (x >= 0 && y >= 0 && x < width && y < height) pixels[y * width + x] = 23;
          }
        }
      }
    }
    cursor += glyphWidth + scale;
  }
}

function png(width, height, gray) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0;
    gray.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width);
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, chunk('IHDR', ihdr(width, height)), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function ihdr(width, height) {
  const buffer = Buffer.alloc(13);
  buffer.writeUInt32BE(width, 0);
  buffer.writeUInt32BE(height, 4);
  buffer[8] = 8;
  buffer[9] = 0;
  return buffer;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])) >>> 0, 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return ~crc;
}

function decodePngSize(pngBuffer) {
  return { width: pngBuffer.readUInt32BE(16), height: pngBuffer.readUInt32BE(20) };
}

function decodeGray(pngBuffer) {
  const width = pngBuffer.readUInt32BE(16);
  const height = pngBuffer.readUInt32BE(20);
  const idat = [];
  let offset = 8;
  while (offset < pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(offset);
    const type = pngBuffer.subarray(offset + 4, offset + 8).toString();
    const data = pngBuffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
  }
  const { inflateSync } = require('node:zlib');
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) pixels.set(raw.subarray(y * (width + 1) + 1, (y + 1) * (width + 1)), y * width);
  return pixels;
}

async function writeQrCodes() {
  const publicQr = await QRCode.create(PUBLIC_BOARD_URL, { errorCorrectionLevel: 'M' });
  const controlQr = await QRCode.create(CONTROLLER_URL, { errorCorrectionLevel: 'M' });
  const publicPng = renderLabeled(publicQr, 'PUBLIC BOARD');
  const controlPng = renderLabeled(controlQr, 'CONTROLLER');
  writeFileSync(path.join(root, 'KartBoard-iPhone-QR.png'), publicPng);
  writeFileSync(path.join(root, 'KartBoard-KAC-QR.png'), controlPng);
  writeFileSync(path.join(root, 'KartBoard-QR-Codes.png'), sideBySide(publicPng, controlPng));
  console.log(PUBLIC_BOARD_URL);
  console.log(CONTROLLER_URL);
}

const FONT = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110]
};

await writeQrCodes();
