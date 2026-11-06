import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendToStorage } from './storage-upload';

describe('sendToStorage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('R2: a PUT of the raw file with exactly the returned headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal('fetch', fetchMock);
    const file = new Blob(['x']);
    const headers = { 'Content-Type': 'image/png', 'Cache-Control': 'public' };
    await sendToStorage({ url: 'https://r2/k', fields: {}, method: 'PUT', headers }, file);
    expect(fetchMock).toHaveBeenCalledWith('https://r2/k', { method: 'PUT', headers, body: file });
  });

  it('AWS: a POST form with the fields and the file last', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal('fetch', fetchMock);
    await sendToStorage({ url: 'https://s3/', fields: { key: 'k' } }, new Blob(['x']));
    const init = fetchMock.mock.calls[0][1] as { method: string; body: FormData };
    expect(init.method).toBe('POST');
    expect([...init.body.keys()]).toEqual(['key', 'file']);
  });
});
