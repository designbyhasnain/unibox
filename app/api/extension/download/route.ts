import { NextResponse } from 'next/server';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(entries: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const centralDir: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf-8');
    const data = entry.data;
    const crc = crc32(data);

    const local = Buffer.alloc(30 + nameBuffer.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    nameBuffer.copy(local, 30);
    parts.push(local, data);

    const cd = Buffer.alloc(46 + nameBuffer.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuffer.length, 28);
    cd.writeUInt32LE(offset, 42);
    nameBuffer.copy(cd, 46);
    centralDir.push(cd);

    offset += local.length + data.length;
  }

  const cdSize = centralDir.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...parts, ...centralDir, eocd]);
}

function collectFiles(dir: string, prefix = ''): { name: string; data: Buffer }[] {
  const skip = new Set(['dist', 'node_modules', '.git', 'build.js', 'zip.js', 'package.json', 'package-lock.json']);
  const entries: { name: string; data: Buffer }[] = [];
  try {
    for (const item of readdirSync(dir)) {
      if (skip.has(item)) continue;
      const full = join(dir, item);
      const name = prefix ? `${prefix}/${item}` : item;
      if (statSync(full).isDirectory()) entries.push(...collectFiles(full, name));
      else entries.push({ name, data: readFileSync(full) });
    }
  } catch {}
  return entries;
}

export async function GET() {
  try {
    const files = collectFiles(join(process.cwd(), 'chrome-extension'));
    if (files.length === 0) return NextResponse.json({ error: 'Extension not found' }, { status: 404 });

    const zip = buildZip(files);
    return new NextResponse(new Uint8Array(zip) as any, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="unibox-prospector.zip"',
        'Content-Length': zip.length.toString(),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
