import type { PinoLogger } from 'nestjs-pino';
import { CircuitOpenError } from '../../../../common/resilience/resilience';
import { TwilioSmsProvider, twilioBreaker } from './twilio-sms.provider';

const create: jest.Mock<Promise<unknown>, unknown[]> = jest.fn();
jest.mock('twilio', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    messages: { create: (...a: unknown[]): Promise<unknown> => create(...a) },
  })),
}));

/**
 * Owner 2026-10-15: a hung or failing Twilio must not hang the sign-in:
 * one retry after a brief failure, no retry for a rejected number, and a
 * pause after five failing sends in a row.
 */
describe('TwilioSmsProvider resilience', () => {
  const logger = { info: jest.fn() } as unknown as PinoLogger;
  const provider = new TwilioSmsProvider(
    { accountSid: 'AC1', authToken: 't', fromNumber: '+15550001' },
    logger,
  );

  beforeEach(() => {
    create.mockReset();
    twilioBreaker.reset();
  });

  it('sends once when Twilio answers', async () => {
    create.mockResolvedValue({ sid: 'SM1' });
    await provider.send('+14155550100', '123456');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      to: '+14155550100',
      from: '+15550001',
    });
  });

  it('tries once more after a network failure', async () => {
    create
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ sid: 'SM1' });
    await provider.send('+14155550100', '123456');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not retry a rejected number (the caller's fault)", async () => {
    create.mockRejectedValue(
      Object.assign(new Error('invalid'), { status: 400 }),
    );
    await expect(provider.send('+1', '123456')).rejects.toThrow('invalid');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('after five failing sends it stops calling Twilio for a while', async () => {
    create.mockRejectedValue(Object.assign(new Error('down'), { status: 503 }));
    for (let i = 0; i < 5; i += 1) {
      await expect(provider.send('+14155550100', '123456')).rejects.toThrow(
        'down',
      );
    }
    const before = create.mock.calls.length;
    await expect(
      provider.send('+14155550100', '123456'),
    ).rejects.toBeInstanceOf(CircuitOpenError);
    expect(create.mock.calls.length).toBe(before);
  }, 20_000);

  it('a 4xx never counts toward the breaker', async () => {
    create.mockRejectedValue(Object.assign(new Error('bad'), { status: 400 }));
    for (let i = 0; i < 8; i += 1) {
      await expect(provider.send('+1', '1')).rejects.toThrow('bad');
    }
    expect(create).toHaveBeenCalledTimes(8);
    expect(twilioBreaker.isOpen).toBe(false);
  });
});
