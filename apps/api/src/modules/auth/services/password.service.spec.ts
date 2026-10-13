import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with a random salt and verifies the right password', async () => {
    const a = await service.hash('Correct horse 1');
    const b = await service.hash('Correct horse 1');
    expect(a).not.toEqual(b);
    expect(a.startsWith('scrypt$')).toBe(true);
    expect(await service.verify('Correct horse 1', a)).toBe(true);
  });

  it('rejects a wrong password and a missing hash', async () => {
    const hash = await service.hash('Correct horse 1');
    expect(await service.verify('Correct horse 2', hash)).toBe(false);
    expect(await service.verify('anything', null)).toBe(false);
    expect(await service.verify('anything', 'not-a-hash')).toBe(false);
  });

  it('treats equivalent unicode forms as the same password', async () => {
    const hash = await service.hash('Café-1234');
    expect(await service.verify('Café-1234', hash)).toBe(true);
  });

  it('enforces 8 to 128 characters', () => {
    expect(service.isAcceptable('1234567')).toBe(false);
    expect(service.isAcceptable('12345678')).toBe(true);
    expect(service.isAcceptable('x'.repeat(129))).toBe(false);
  });
});
