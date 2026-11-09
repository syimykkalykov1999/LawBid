import { LinkPreviewService } from './link-preview.service';

/** Feature reality audit 2026-11-08: «Карточки ссылок в чате» switched off
 * shows no card and no longer uses up the person's daily quota. */
function setup(mode: unknown) {
  const limiter = {
    consumeFixedWindow: jest.fn(() =>
      Promise.resolve({ allowed: false, retryAfterSeconds: 60 }),
    ),
  };
  const settings = {
    raw: jest.fn(() => Promise.resolve(mode)),
    number: jest.fn(() => Promise.resolve(50)),
    stringList: jest.fn(() => Promise.resolve([])),
  };
  const config = { get: jest.fn(() => 'test') };
  const svc = new LinkPreviewService(
    { get: jest.fn(() => Promise.resolve(null)) } as never,
    limiter as never,
    settings as never,
    config as never,
  );
  return { svc, limiter };
}

describe('link previews and the admin switch', () => {
  it('off: an empty card, no quota spent', async () => {
    const { svc, limiter } = setup('off');
    await expect(svc.preview('u1', 'https://example.com/a')).resolves.toEqual(
      expect.objectContaining({ title: null, imageUrl: null }),
    );
    expect(limiter.consumeFixedWindow).not.toHaveBeenCalled();
  });

  it('on: the quota applies as before', async () => {
    const { svc, limiter } = setup('on');
    await expect(svc.preview('u1', 'https://example.com/a')).rejects.toThrow(
      'Too many link previews',
    );
    expect(limiter.consumeFixedWindow).toHaveBeenCalled();
  });
});
