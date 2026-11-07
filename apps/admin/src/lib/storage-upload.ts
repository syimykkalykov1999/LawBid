/** The presigned target of `POST …/uploads` (`upload` in the API answer). */
export interface StorageTarget {
  url: string;
  fields: Record<string, string>;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
}

/**
 * Sends [file] to the presigned target. Files in Cloudflare R2 answer a
 * presigned PUT (the raw file with exactly the returned headers); AWS answers
 * a presigned POST (the form fields, the file last, S3 POST policy).
 */
export function sendToStorage(target: StorageTarget, file: Blob): Promise<Response> {
  if (target.method === 'PUT') {
    return fetch(target.url, { method: 'PUT', headers: target.headers, body: file });
  }
  const form = new FormData();
  for (const [k, v] of Object.entries(target.fields)) form.append(k, v);
  form.append('file', file);
  return fetch(target.url, { method: 'POST', body: form });
}
