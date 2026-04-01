import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';
import { Readable } from 'stream';

export async function GET() {
    const distDir = path.join(process.cwd(), 'chrome-extension', 'dist');

    if (!fs.existsSync(distDir)) {
        return NextResponse.json({ error: 'Extension not built. Run: cd chrome-extension && node build.js' }, { status: 404 });
    }

    // Create zip in memory
    const archive = archiver.default('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    return new Promise<Response>((resolve) => {
        archive.on('data', (chunk: Buffer) => chunks.push(chunk));
        archive.on('end', () => {
            const buf = Buffer.concat(chunks);
            resolve(new Response(buf, {
                headers: {
                    'Content-Type': 'application/zip',
                    'Content-Disposition': 'attachment; filename="unibox-extension.zip"',
                    'Content-Length': buf.length.toString(),
                },
            }));
        });
        archive.on('error', () => {
            resolve(NextResponse.json({ error: 'Failed to create zip' }, { status: 500 }));
        });

        archive.directory(distDir, false);
        archive.finalize();
    });
}
