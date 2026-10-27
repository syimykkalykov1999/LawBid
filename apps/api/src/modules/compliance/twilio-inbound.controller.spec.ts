import { NotFoundException } from '@nestjs/common';
import twilio from 'twilio';
import {
  TwilioInboundController,
  webhookUrlOf,
} from './twilio-inbound.controller';

const TOKEN = 'test-auth-token';
const req = {
  protocol: 'https',
  get: (n: string) => (n === 'host' ? 'api.example.com' : undefined),
  originalUrl: '/api/v1/webhooks/twilio/sms',
};
const url = webhookUrlOf(req);

function build(token: string | null = TOKEN) {
  const handleInbound = jest
    .fn()
    .mockResolvedValue({ keyword: 'help', reply: 'Help me' });
  const secrets = {
    get: jest
      .fn()
      .mockResolvedValue(token ? { fields: { authToken: token } } : null),
  };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const ctl = new TwilioInboundController(
    { handleInbound } as never,
    secrets as never,
    config as never,
  );
  const res = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  };
  return { ctl, handleInbound, res };
}

describe('TwilioInboundController', () => {
  const body = {
    From: '+15551230000',
    Body: 'STOP',
    MessageSid: 'SM1',
    OptOutType: 'STOP',
  };

  it('hands a correctly signed message to the compliance service and answers TwiML', async () => {
    const { ctl, handleInbound, res } = build();
    const sig = twilio.getExpectedTwilioSignature(TOKEN, url, body);
    await ctl.inbound(req, body, sig, res as never);
    expect(handleInbound).toHaveBeenCalledWith({
      from: '+15551230000',
      body: 'STOP',
      optOutType: 'STOP',
      messageSid: 'SM1',
    });
    expect(res.send.mock.calls[0][0]).toContain('<Message>Help me</Message>');
  });

  it('answers 404 to a bad or missing signature, and never acts', async () => {
    const { ctl, handleInbound, res } = build();
    await expect(
      ctl.inbound(req, body, 'bad', res as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      ctl.inbound(req, body, undefined, res as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(handleInbound).not.toHaveBeenCalled();
  });

  it('answers 404 when Twilio keys are not set', async () => {
    const { ctl, res } = build(null);
    const sig = twilio.getExpectedTwilioSignature(TOKEN, url, body);
    await expect(
      ctl.inbound(req, body, sig, res as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
