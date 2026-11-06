import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentGallery, type GalleryDoc } from './document-gallery';

const POST = vi.fn();
vi.mock('@/lib/api/client', () => ({
  api: { POST: (...a: unknown[]) => POST(...a) },
  ApiError: class extends Error {
    constructor(readonly status: number) {
      super('x');
    }
  },
}));

const doc = (id: string, docType: string, side: string | null = null, mime = 'image/jpeg'): GalleryDoc => ({ id, docType, side, mime, scanStatus: 'clean' });
// shuffled on purpose: the gallery puts them in the owner's order
const DOCS: GalleryDoc[] = [doc('selfie', 'selfie'), doc('bar', 'bar_license', null, 'application/pdf'), doc('dl-back', 'drivers_license', 'back'), doc('dl-front', 'drivers_license', 'front')];

const urlCalls = (id?: string) => POST.mock.calls.filter(([p, init]) => p === '/admin/verification/documents/{documentId}/url' && (!id || JSON.stringify(init).includes(`"${id}"`))).length;

function show(extra: { actions?: React.ReactNode; lastSlide?: React.ReactNode } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <button type="button">before</button>
      <DocumentGallery requestId="req-12345678" documents={DOCS} {...extra} />
    </QueryClientProvider>,
  );
}

const frames = () => screen.getAllByTestId('document-thumb-frame');
const title = () => screen.getByTestId('lightbox-title').textContent;
const counter = () => screen.getByTestId('lightbox-counter').textContent;

beforeEach(() => {
  POST.mockReset();
  POST.mockImplementation(async (_p: string, init: { params: { path: { documentId: string } } }) => ({
    data: { data: { url: `https://files.example/${init.params.path.documentId}`, expiresAt: new Date(Date.now() + 600_000).toISOString() } },
  }));
});
afterEach(cleanup);

describe('document gallery (R-393)', () => {
  it('lays thumbnails out in two rows of two equal frames: licence front/back, then bar licence and selfie', async () => {
    show();
    await screen.findAllByRole('img');
    const rows = screen.getAllByTestId('document-gallery-row');
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.className).toContain('grid-cols-2');
    const labels = rows.map((row) => within(row).getAllByTestId('document-thumb').map((f) => f.querySelector('figcaption')?.textContent));
    expect(labels).toEqual([
      ['водительские права (лицевая)', 'водительские права (оборот)'],
      ['лицензия адвоката', 'селфи'],
    ]);
    // the same fixed-aspect frame everywhere, the picture shown whole
    const classes = new Set(frames().map((f) => f.className.split(' ').filter((c) => c.startsWith('aspect-') || c === 'w-full').join(' ')));
    expect(classes.size).toBe(1);
    for (const img of screen.getAllByRole('img')) expect(img.className).toContain('object-contain');
    // the PDF is an icon tile, not an <img>
    expect(screen.getByTestId('document-thumb-pdf')).toBeTruthy();
  });

  it('a click opens the lightbox on that document; arrows, «Назад / Вперёд» and Esc work', async () => {
    show();
    await screen.findAllByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'Открыть на весь экран: водительские права (оборот)' }));
    expect(screen.getByTestId('lightbox')).toBeTruthy();
    expect(counter()).toBe('2 из 4');
    expect(title()).toBe('водительские права (оборот)');
    // focus starts inside the lightbox, the page under it does not scroll
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Закрыть');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(counter()).toBe('3 из 4');
    expect(title()).toBe('лицензия адвоката');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(counter()).toBe('1 из 4');
    fireEvent.click(screen.getByRole('button', { name: /Назад/ }));
    expect(counter()).toBe('4 из 4');
    fireEvent.click(screen.getByRole('button', { name: /Вперёд/ }));
    expect(counter()).toBe('1 из 4');
    fireEvent.click(screen.getByRole('button', { name: 'Следующее' }));
    expect(counter()).toBe('2 из 4');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('lightbox')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('Tab stays inside the open lightbox', async () => {
    show();
    await screen.findAllByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'Открыть на весь экран: селфи' }));
    const box = screen.getByTestId('lightbox');
    const buttons = within(box).getAllByRole('button');
    buttons[buttons.length - 1]!.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(box.contains(document.activeElement)).toBe(true);
    buttons[0]!.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  });

  it('a PDF opens inside the lightbox in a frame', async () => {
    show();
    await screen.findAllByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'Открыть на весь экран: лицензия адвоката' }));
    const frame = screen.getByTitle('лицензия адвоката');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.getAttribute('src')).toBe('https://files.example/bar');
  });

  it('R-400: the conveyor controls sit under the thumbnails and appear in the lightbox only on the last document', async () => {
    show({ actions: <span data-testid="bar-page">registry</span>, lastSlide: <span data-testid="bar-overlay">registry</span> });
    await screen.findAllByRole('img');
    expect(screen.getByTestId('document-gallery-actions').contains(screen.getByTestId('bar-page'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Открыть на весь экран: водительские права (лицевая)' }));
    expect(counter()).toBe('1 из 4');
    expect(screen.queryByTestId('lightbox-last-slide')).toBeNull();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(counter()).toBe('4 из 4');
    expect(screen.getByTestId('lightbox-last-slide').contains(screen.getByTestId('bar-overlay'))).toBe(true);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.queryByTestId('lightbox-last-slide')).toBeNull();
  });

  it('asks each signed link once, across opening and closing the lightbox', async () => {
    show();
    await screen.findAllByRole('img');
    await waitFor(() => expect(urlCalls()).toBe(4));
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Открыть на весь экран: селфи' }));
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      fireEvent.keyDown(window, { key: 'Escape' });
    }
    expect(urlCalls()).toBe(4);
    for (const id of ['dl-front', 'dl-back', 'bar', 'selfie']) expect(urlCalls(id)).toBe(1);
  });
});
