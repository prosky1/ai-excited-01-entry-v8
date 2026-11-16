// ai-excited-01 entry v8 — "Breaching Whale" (Node 22, standard library only).
//
// The entry image is the entry.png beside this file: a JPEG (told apart by its
// first bytes, as RULES.txt allows) of a colossal blue whale breaching
// explosively out of a mountain lake at sunset. This program validates it
// (magic bytes, 1 MiB size cap, exact 1024x1024 dimensions), copies it to
// $MAKEFUN_OUTPUT_DIR (absolute /output fallback), then re-reads the output
// and proves byte-identity via sha256.
//
// Deterministic, no network. No file is ever deleted here: the grader runs as
// user nobody and cannot delete /output, so this program only ever writes.
// Outside the grader's container:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 1048576;
const EXPECTED_WIDTH = 1024;
const EXPECTED_HEIGHT = 1024;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8]);

function fail(message: string): never {
  throw new Error(`entry validation failed: ${message}`);
}

function pngDimensions(buf: Buffer): { width: number; height: number } {
  if (buf.length < 24) fail('PNG too short for IHDR');
  if (buf.subarray(12, 16).toString('ascii') !== 'IHDR') fail('PNG missing IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegDimensions(buf: Buffer): { width: number; height: number } {
  // Walk JPEG markers until a Start Of Frame marker (0xC0-0xCF except
  // 0xC4, 0xC8, 0xCC) carrying width/height.
  let i = 2;
  while (i + 9 <= buf.length) {
    if (buf[i] !== 0xff) fail('JPEG marker desync');
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    const length = buf.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > buf.length) fail('JPEG segment out of bounds');
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  fail('JPEG has no SOF marker');
}

const sourcePath = fileURLToPath(new URL('./entry.png', import.meta.url));
const size = statSync(sourcePath).size;
if (size > MAX_BYTES) fail(`image is ${size} bytes, over the ${MAX_BYTES} byte cap`);

const bytes = readFileSync(sourcePath);
let dimensions: { width: number; height: number };
if (bytes.subarray(0, 8).equals(PNG_MAGIC)) {
  dimensions = pngDimensions(bytes);
} else if (bytes.subarray(0, 2).equals(JPEG_MAGIC)) {
  dimensions = jpegDimensions(bytes);
} else {
  fail('image is neither PNG nor JPEG (unrecognised magic bytes)');
}
if (dimensions.width !== EXPECTED_WIDTH || dimensions.height !== EXPECTED_HEIGHT) {
  fail(`image is ${dimensions.width}x${dimensions.height}, expected ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}`);
}

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const outPath = join(outDir, 'entry.png');
copyFileSync(sourcePath, outPath);

const expectedHash = createHash('sha256').update(bytes).digest('hex');
const writtenHash = createHash('sha256').update(readFileSync(outPath)).digest('hex');
if (writtenHash !== expectedHash) fail('output bytes differ from source (sha256 mismatch)');
console.log(`entry.png written to ${outPath} (${size} bytes, sha256 ${expectedHash})`);
