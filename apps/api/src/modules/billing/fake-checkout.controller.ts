import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { PAYMENT_PROVIDER } from './billing.constants';
import { FakePaymentProvider } from './fake-payment.provider';
import type { PaymentProvider } from './payment-provider';
import { SubscriptionsService } from './subscriptions.service';

const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
body{margin:0;font-family:-apple-system,Roboto,Arial,sans-serif;background:#0A1A3F;color:#fff;
display:flex;min-height:100vh;align-items:center;justify-content:center}
.card{background:#fff;color:#0A1A3F;border-radius:20px;padding:32px 24px;max-width:360px;width:88%;
box-shadow:0 20px 60px rgba(0,0,0,.35);text-align:center;animation:in .4s ease-out}
@keyframes in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
h1{font-size:22px;margin:8px 0 4px}p{color:#5b6478;font-size:14px;line-height:1.5}
.mark{font-size:13px;letter-spacing:.2em;color:#C9A24A;font-weight:700}
button{margin-top:16px;width:100%;height:48px;border:0;border-radius:24px;background:#0A1A3F;
color:#fff;font-size:16px;font-weight:600}.test{font-size:12px;color:#C9A24A;margin-top:12px}
</style></head><body><div class="card"><div class="mark">LAWBID</div>${body}</div></body></html>`;

/**
 * Dev / e2e only (the fake provider): stands in for Stripe's hosted
 * checkout page so the whole web-payment flow works without keys. 404
 * whenever the real Stripe provider is configured.
 */
@ApiExcludeController()
@Public()
@Controller('subscriptions/fake-checkout')
export class FakeCheckoutController {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  private fake(): FakePaymentProvider {
    // The provider is a dynamic proxy (owner 2026-10-01): check by name.
    if (this.provider.name !== 'fake') throw new NotFoundException();
    return this.provider as unknown as FakePaymentProvider;
  }

  @Get(':id')
  async show(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const s = await this.fake().retrieveCheckoutSession(id);
    if (!s) throw new NotFoundException();
    res.type('html').send(
      page(
        'LawBid — Subscribe',
        `<h1>Attorney subscription</h1><p>$399 / month. Cancel anytime.</p>
<form method="post" action="${id}/pay"><button type="submit">Pay with test card</button></form>
<div class="test">Test mode — no real charge</div>`,
      ),
    );
  }

  @Post(':id/pay')
  async pay(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const fake = this.fake();
    await fake.payCheckout(id);
    await this.subscriptions.applyCheckout(id);
    res
      .type('html')
      .send(
        page(
          'LawBid — Done',
          `<h1>You're subscribed</h1><p>Return to the LawBid app — your subscription is active.</p>`,
        ),
      );
  }
}
