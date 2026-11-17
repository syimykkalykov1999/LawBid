import { OutreachController } from './outreach.controller';

/** Detective R2B-14 (14.11): a link scanner opening the mail must not
 * unsubscribe the lead — GET shows a confirm page, POST does it. */
function res() {
  const r = {
    statusCode: 0,
    body: '',
    setHeader: jest.fn(),
    status(code: number) {
      r.statusCode = code;
      return r;
    },
    send(b: string) {
      r.body = b;
      return r;
    },
  };
  return r;
}

describe('outreach unsubscribe (R2B-14)', () => {
  // A low-entropy stand-in (gitleaks generic-api-key, 14.11).
  const TOKEN = 'u'.repeat(20);
  it('GET only shows a confirm page with a POST button', () => {
    const svc = { unsubscribe: jest.fn(() => Promise.resolve(true)) };
    const r = res();
    void new OutreachController(svc as never).outreachUnsubscribe(
      TOKEN,
      r as never,
    );
    expect(svc.unsubscribe).not.toHaveBeenCalled();
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain(
      `<form method="post" action="/api/v1/outreach/unsubscribe/${TOKEN}">`,
    );
  });

  it('POST (the button or RFC 8058 one-click) unsubscribes', async () => {
    const svc = { unsubscribe: jest.fn(() => Promise.resolve(true)) };
    const r = res();
    await new OutreachController(svc as never).outreachUnsubscribeOneClick(
      TOKEN,
      r as never,
    );
    expect(svc.unsubscribe).toHaveBeenCalledWith(TOKEN);
    expect(r.statusCode).toBe(200);
  });

  // R2B-14 (14.11): signed links (`u1.<kid>.<id>.<mac>`) are longer and
  // carry dots; the confirm page opens for them too.
  it('GET shows the page for a signed link', () => {
    const signed = `u1.k1.${'A'.repeat(22)}.${'B'.repeat(22)}`;
    const svc = { unsubscribe: jest.fn(() => Promise.resolve(true)) };
    const r = res();
    new OutreachController(svc as never).outreachUnsubscribe(
      signed,
      r as never,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain(`/api/v1/outreach/unsubscribe/${signed}"`);
  });
});
