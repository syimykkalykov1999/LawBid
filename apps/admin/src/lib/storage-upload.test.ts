import { describe, expect, it, vi } from 'vitest';
import {
  defaultBackoff,
  isTemporary,
  putResumable,
  RESUMABLE_THRESHOLD_BYTES,
  sendToStorage,
  StorageUploadError,
  type MultipartPlan,
  type RawRequest,
  type RawResult,
} from './storage-upload';

const noWait = () => 0;

/** A storage that answers the given statuses in order (then 200). */
function storage(statuses: number[]) {
  const calls: { method: string; url: string; size: number }[] = [];
  const request: RawRequest = (method, url, _h, body, onProgress) => {
    const size = body instanceof Blob ? body.size : 0;
    calls.push({ method, url, size });
    onProgress?.(size, size);
    const status = statuses.shift() ?? 200;
    return Promise.resolve<RawResult>({ status });
  };
  return { request, calls };
}

describe('sendToStorage: the two shapes of a presigned target', () => {
  it('R2: a PUT of the raw file with exactly the returned headers', async () => {
    const seen: { method: string; url: string; headers?: Record<string, string>; body: Blob | FormData }[] = [];
    const request: RawRequest = (method, url, headers, body) => {
      seen.push({ method, url, headers, body });
      return Promise.resolve({ status: 200 });
    };
    const file = new Blob(['x']);
    const headers = { 'Content-Type': 'image/png', 'Cache-Control': 'public' };
    await sendToStorage({ url: 'https://r2/k', fields: {}, method: 'PUT', headers }, file, { request });
    expect(seen).toEqual([{ method: 'PUT', url: 'https://r2/k', headers, body: file }]);
  });

  it('AWS: a POST form with the fields and the file last, a fresh form per try', async () => {
    const forms: FormData[] = [];
    const statuses = [500, 200];
    const request: RawRequest = (_m, _u, _h, body) => {
      forms.push(body as FormData);
      return Promise.resolve({ status: statuses.shift()! });
    };
    await sendToStorage({ url: 'https://s3/', fields: { key: 'k' } }, new Blob(['x']), { request, backoff: noWait });
    expect(forms).toHaveLength(2);
    expect(forms[0]).not.toBe(forms[1]);
    expect([...forms[1].keys()]).toEqual(['key', 'file']);
  });
});

describe('sendToStorage (admin speed gaps D-c4: progress + retries)', () => {
  it('retries a lost connection and a busy storage, then succeeds', async () => {
    const s = storage([0, 503, 429]);
    const progress: number[] = [];
    await sendToStorage({ url: 'https://r2/x', fields: {}, method: 'PUT' }, new Blob(['abc']), {
      request: s.request,
      backoff: noWait,
      onProgress: (f) => progress.push(f),
    });
    expect(s.calls).toHaveLength(4);
    expect(progress.at(-1)).toBe(1);
  });

  it('does not retry a refusal (expired policy = 403)', async () => {
    const s = storage([403]);
    await expect(
      sendToStorage({ url: 'https://s3/x', fields: { key: 'k' } }, new Blob(['abc']), { request: s.request, backoff: noWait }),
    ).rejects.toMatchObject({ name: 'StorageUploadError', status: 403 });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0].method).toBe('POST');
  });

  it('gives up after the attempts with the network text', async () => {
    const s = storage([0, 0, 0, 0, 0]);
    const err = await sendToStorage({ url: 'https://r2/x', fields: {}, method: 'PUT' }, new Blob(['abc']), {
      request: s.request,
      backoff: noWait,
      attempts: 3,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageUploadError);
    expect((err as StorageUploadError).message).toMatch(/сеть или CORS/);
    expect(s.calls).toHaveLength(3);
  });

  it('temporary = network, 408, 429, 5xx; backoff doubles up to 30 s', () => {
    expect([0, 408, 429, 500, 503].every(isTemporary)).toBe(true);
    expect([400, 403, 404, 413].some(isTemporary)).toBe(false);
    expect([1, 2, 3, 4, 10].map(defaultBackoff)).toEqual([1000, 2000, 4000, 8000, 30000]);
  });
});

describe('putResumable (the app\'s parts loop, copied for the admin)', () => {
  const MIB = 1024 * 1024;
  const big = new Blob([new Uint8Array(20 * MIB)]); // 8 + 8 + 4

  const planOf = (uploaded: number[]): MultipartPlan => {
    const missing = [1, 2, 3].filter((n) => !uploaded.includes(n));
    return {
      partSizeBytes: 8 * MIB,
      partCount: 3,
      uploadedParts: uploaded,
      parts: missing.map((n) => ({ partNumber: n, url: `https://s3/part/${n}` })),
    };
  };

  it('small file: no plan asked, caller sends it whole', async () => {
    const plan = vi.fn();
    expect(await putResumable(new Blob(['x']), { plan, complete: vi.fn() })).toBe(false);
    expect(plan).not.toHaveBeenCalled();
    expect(RESUMABLE_THRESHOLD_BYTES).toBe(16 * MIB);
  });

  it('server refuses parts (null plan) → false, nothing sent', async () => {
    const s = storage([]);
    expect(await putResumable(big, { plan: () => Promise.resolve(null), complete: vi.fn() }, { request: s.request })).toBe(false);
    expect(s.calls).toHaveLength(0);
  });

  it('sends every missing part with the right slice, re-plans, completes', async () => {
    const s = storage([]);
    const uploaded = new Set<number>();
    const plan = vi.fn(() => {
      const p = planOf([...uploaded]);
      // storage "receives" what the client PUT since the last plan
      return Promise.resolve(p);
    });
    const request: RawRequest = (m, url, h, body, onP, sig) => {
      uploaded.add(Number(url.split('/').pop()));
      return s.request(m, url, h, body, onP, sig);
    };
    const complete = vi.fn(() => Promise.resolve());
    const progress: number[] = [];
    expect(await putResumable(big, { plan, complete }, { request, backoff: noWait, onProgress: (f) => progress.push(f) })).toBe(true);
    expect(s.calls.map((c) => c.size).sort((a, b) => a - b)).toEqual([4 * MIB, 8 * MIB, 8 * MIB]);
    expect(plan).toHaveBeenCalledTimes(2); // once for links, once to see nothing is missing
    expect(complete).toHaveBeenCalledTimes(1);
    expect(progress.at(-1)).toBe(1);
  });

  it('after an interruption only the parts storage lacks are sent again', async () => {
    const s = storage([]);
    const plans = [planOf([1]), planOf([1, 2, 3])];
    const plan = vi.fn(() => Promise.resolve(plans.shift()!));
    const complete = vi.fn(() => Promise.resolve());
    await putResumable(big, { plan, complete }, { request: s.request, backoff: noWait });
    expect(s.calls.map((c) => c.url)).toEqual(['https://s3/part/2', 'https://s3/part/3']);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('a part refused for good stops the others and surfaces the error', async () => {
    const request: RawRequest = (_m, url) => Promise.resolve({ status: url.endsWith('/2') ? 403 : 200 });
    const complete = vi.fn();
    await expect(
      putResumable(big, { plan: () => Promise.resolve(planOf([])), complete }, { request, backoff: noWait }),
    ).rejects.toMatchObject({ status: 403 });
    expect(complete).not.toHaveBeenCalled();
  });
});
