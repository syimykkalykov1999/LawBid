import type { PinoLogger } from 'nestjs-pino';
import { CircuitOpenError } from '../../../../common/resilience/resilience';
import {
  SesEmailProvider,
  isSesServiceFault,
  sesBreaker,
} from './ses-email.provider';

const send: jest.Mock<Promise<unknown>, unknown[]> = jest.fn();
jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({
    send: (...a: unknown[]): Promise<unknown> => send(...a),
  })),
  SendEmailCommand: jest.fn((input: unknown) => ({ input })),
  SendRawEmailCommand: jest.fn((input: unknown) => ({ input })),
}));

/** Batch C item 6: a failing SES must not hang or hammer the sign-in. */
describe('SesEmailProvider resilience', () => {
  const logger = { info: jest.fn() } as unknown as PinoLogger;
  const provider = new SesEmailProvider(
    { region: 'us-east-1', fromAddress: 'no-reply@lawbid.test' },
    logger,
  );
  const msg = { to: 'a@b.test', subject: 's', text: 't' };

  beforeEach(() => {
    send.mockReset();
    sesBreaker.reset();
  });

  it('sends once when SES answers', async () => {
    send.mockResolvedValue({});
    await provider.sendEmail(msg);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not retry (a timed-out send may still arrive)', async () => {
    send.mockRejectedValue(
      Object.assign(new Error('boom'), { $metadata: { httpStatusCode: 500 } }),
    );
    await expect(provider.sendEmail(msg)).rejects.toThrow('boom');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('pauses SES after five service faults in a row', async () => {
    send.mockRejectedValue(
      Object.assign(new Error('down'), { $metadata: { httpStatusCode: 503 } }),
    );
    for (let i = 0; i < 5; i += 1) {
      await expect(provider.sendEmail(msg)).rejects.toThrow('down');
    }
    await expect(provider.sendEmail(msg)).rejects.toBeInstanceOf(
      CircuitOpenError,
    );
    expect(send).toHaveBeenCalledTimes(5);
  });

  it('a rejected address (4xx) never opens the circuit', async () => {
    send.mockRejectedValue(
      Object.assign(new Error('MessageRejected'), {
        $metadata: { httpStatusCode: 400 },
      }),
    );
    for (let i = 0; i < 8; i += 1) {
      await expect(provider.sendEmail(msg)).rejects.toThrow('MessageRejected');
    }
    expect(sesBreaker.isOpen).toBe(false);
  });

  it('classifies faults', () => {
    expect(isSesServiceFault(new Error('socket hang up'))).toBe(true);
    expect(isSesServiceFault({ $metadata: { httpStatusCode: 400 } })).toBe(
      false,
    );
    expect(isSesServiceFault({ $metadata: { httpStatusCode: 502 } })).toBe(
      true,
    );
  });
});
