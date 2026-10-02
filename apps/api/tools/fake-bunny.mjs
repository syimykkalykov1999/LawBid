#!/usr/bin/env node
/**
 * DEV ONLY — a local stand-in for Bunny Stream, so reels work end to end on
 * the emulator without Bunny keys (owner 2026-10-02):
 *
 *   node tools/fake-bunny.mjs          # listens on :4010, needs ffmpeg
 *   DEV_FAKE_BUNNY=true npm run start:dev   # the API talks to it
 *
 * It speaks the little of Bunny the app uses: create/get/delete video,
 * TUS uploads (what the phone sends), ffmpeg → HLS + thumbnail, and the
 * CDN path `/bcdn_token=…/<guid>/<file>` (the token is not checked here).
 * The API only uses it when DEV_FAKE_BUNNY=true (refused in production).
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.FAKE_BUNNY_PORT ?? 4010);
const ROOT =
  process.env.FAKE_BUNNY_DIR ??
  join(dirname(fileURLToPath(import.meta.url)), '..', '.fake-bunny');
await mkdir(ROOT, { recursive: true });

const dir = (guid) => join(ROOT, guid.replace(/[^a-zA-Z0-9-]/g, ''));
const metaFile = (guid) => join(dir(guid), 'meta.json');
const readMeta = async (guid) => {
  try {
    return JSON.parse(await readFile(metaFile(guid), 'utf8'));
  } catch {
    return null;
  }
};
const writeMeta = (guid, m) => writeFile(metaFile(guid), JSON.stringify(m));

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}`)),
    );
  });

async function transcode(guid) {
  const m = await readMeta(guid);
  const input = join(dir(guid), 'upload.bin');
  try {
    await writeMeta(guid, { ...m, status: 3 });
    const probe = JSON.parse(
      await run('ffprobe', [
        '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', input,
      ]),
    );
    const v = probe.streams.find((s) => s.codec_type === 'video');
    if (!v) throw new Error('no video stream');
    const out = join(dir(guid), 'hls');
    await mkdir(out, { recursive: true });
    await run('ffmpeg', [
      '-y', '-i', input,
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-hls_time', '4', '-hls_playlist_type', 'vod',
      '-hls_segment_filename', join(out, 'seg%03d.ts'),
      join(out, 'playlist.m3u8'),
    ]);
    await run('ffmpeg', [
      '-y', '-i', input, '-ss', '0.5', '-frames:v', '1', join(out, 'thumbnail.jpg'),
    ]).catch(() => undefined);
    const st = await stat(input);
    await writeMeta(guid, {
      ...m,
      status: 4,
      length: Number(probe.format.duration ?? 0),
      width: v.width ?? 0,
      height: v.height ?? 0,
      storageSize: st.size,
    });
    console.log(`[fake-bunny] ${guid} ready`);
  } catch (e) {
    console.error(`[fake-bunny] ${guid} failed: ${e.message}`);
    await writeMeta(guid, { ...m, status: 5 }).catch(() => undefined);
  }
}

const TYPES = {
  m3u8: 'application/vnd.apple.mpegurl',
  ts: 'video/mp2t',
  jpg: 'image/jpeg',
};

const send = (res, code, body, headers = {}) => {
  res.writeHead(code, {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'Location,Upload-Offset,Upload-Length,Tus-Resumable',
    ...headers,
  });
  res.end(body);
};
const json = (res, code, obj) =>
  send(res, code, JSON.stringify(obj), { 'content-type': 'application/json' });
const body = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;
    const tus = { 'tus-resumable': '1.0.0', 'tus-version': '1.0.0', 'tus-extension': 'creation' };

    // --- Bunny API ------------------------------------------------------
    let m = path.match(/^\/library\/[^/]+\/videos(?:\/([^/]+))?$/);
    if (m) {
      const guid = m[1];
      if (req.method === 'POST' && !guid) {
        const id = randomUUID();
        await mkdir(dir(id), { recursive: true });
        await writeMeta(id, { guid: id, status: 0, length: 0, width: 0, height: 0, storageSize: 0 });
        return json(res, 200, { guid: id });
      }
      const meta = guid ? await readMeta(guid) : null;
      if (req.method === 'GET' && guid) {
        return meta ? json(res, 200, meta) : json(res, 404, { message: 'not found' });
      }
      if (req.method === 'DELETE' && guid) {
        await rm(dir(guid), { recursive: true, force: true });
        return json(res, 200, { success: true });
      }
    }

    // --- TUS ------------------------------------------------------------
    if (path === '/tusupload') {
      if (req.method === 'OPTIONS') {
        return send(res, 204, '', {
          ...tus,
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'POST,PATCH,HEAD,OPTIONS',
        });
      }
      if (req.method === 'POST') {
        const guid = req.headers['videoid'];
        const length = Number(req.headers['upload-length']);
        if (!guid || !(length > 0) || !(await readMeta(guid))) {
          return json(res, 400, { message: 'bad upload' });
        }
        await writeFile(join(dir(guid), 'upload.bin'), '');
        await writeMeta(guid, { ...(await readMeta(guid)), uploadLength: length, status: 0 });
        return send(res, 201, '', { ...tus, location: `/tusupload/${guid}`, 'upload-offset': '0' });
      }
    }
    m = path.match(/^\/tusupload\/([^/]+)$/);
    if (m) {
      const guid = m[1];
      const meta = await readMeta(guid);
      if (!meta) return json(res, 404, { message: 'unknown upload' });
      const file = join(dir(guid), 'upload.bin');
      const offset = (await stat(file)).size;
      if (req.method === 'HEAD') {
        return send(res, 200, '', { ...tus, 'upload-offset': String(offset), 'upload-length': String(meta.uploadLength) });
      }
      if (req.method === 'PATCH') {
        if (Number(req.headers['upload-offset']) !== offset) {
          return json(res, 409, { message: 'offset mismatch' });
        }
        const data = await body(req);
        await appendFile(file, data);
        const next = offset + data.length;
        if (next >= meta.uploadLength) {
          await writeMeta(guid, { ...meta, status: 2 });
          void transcode(guid);
        }
        return send(res, 204, '', { ...tus, 'upload-offset': String(next) });
      }
    }

    // --- CDN: /bcdn_token=…/<guid>/<file> ----------------------------------
    if (req.method === 'GET' || req.method === 'HEAD') {
      const parts = decodeURIComponent(path).split('/').filter(Boolean);
      if (parts.length >= 2) {
        const file = parts[parts.length - 1];
        const guid = parts[parts.length - 2];
        if (/^[\w.-]+$/.test(file)) {
          const p = join(dir(guid), 'hls', file);
          if (existsSync(p)) {
            const size = (await stat(p)).size;
            res.writeHead(200, {
              'access-control-allow-origin': '*',
              'content-type': TYPES[file.split('.').pop()] ?? 'application/octet-stream',
              'content-length': size,
            });
            return req.method === 'HEAD' ? res.end() : createReadStream(p).pipe(res);
          }
        }
      }
    }
    json(res, 404, { message: 'not found' });
  } catch (e) {
    console.error('[fake-bunny]', e);
    json(res, 500, { message: String(e) });
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`[fake-bunny] listening on :${PORT}, data in ${ROOT}`);
});
