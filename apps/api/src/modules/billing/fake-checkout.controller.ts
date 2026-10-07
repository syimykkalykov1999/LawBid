import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { fakeCheckoutAllowed, PAYMENT_PROVIDER } from './billing.constants';
import { FakePaymentProvider } from './fake-payment.provider';
import type { PaymentProvider } from './payment-provider';
import { SubscriptionsService } from './subscriptions.service';
import { PromotionsService } from '../promotions/promotions.service';
import { CasePaymentsService } from '../case-payments/case-payments.service';

/** Request values (ids, the return link) are escaped before they reach
 * the HTML (security audit 2026-10-07: reflected XSS). */
export function escapeHtml(v: string): string {
  return v.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] as string,
  );
}

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
    @Optional() private readonly promotions?: PromotionsService,
    @Optional() private readonly casePayments?: CasePaymentsService,
  ) {}

  private fake(): FakePaymentProvider {
    // Never on a deployed server, whatever the provider says (security
    // audit 2026-10-07); the controller is not even mounted there.
    if (!fakeCheckoutAllowed()) throw new NotFoundException();
    // The provider is a dynamic proxy (owner 2026-10-01): check by name.
    if (this.provider.name !== 'fake') throw new NotFoundException();
    return this.provider as unknown as FakePaymentProvider;
  }

  /** Owner 2026-10-05: stands in for Stripe's Connect onboarding — one
   * click completes the attorney's account. */
  @Get('connect/:accountId')
  showConnect(
    @Param('accountId') accountId: string,
    @Query('return') returnUrl: string | undefined,
    @Res() res: Response,
  ): void {
    this.fake();
    const back = encodeURIComponent(returnUrl ?? '');
    const account = escapeHtml(encodeURIComponent(accountId));
    res.type('html').send(
      page(
        'LawBid — Payout account',
        `<h1>Stripe onboarding</h1><p>Bank details and identity would be collected here.</p>
<form method="post" action="/api/v1/subscriptions/fake-checkout/connect/${account}/complete?return=${back}"><button type="submit">Complete onboarding</button></form>
<div class="test">Test mode — no real account</div>`,
      ),
    );
  }

  @Post('connect/:accountId/complete')
  async completeConnect(
    @Param('accountId') accountId: string,
    @Query('return') returnUrl: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const fake = this.fake();
    fake.completeConnectOnboarding(accountId);
    await this.casePayments?.syncAccount(accountId);
    const link = returnUrl && /^https?:\/\//.test(returnUrl) ? returnUrl : null;
    res
      .type('html')
      .send(
        page(
          'LawBid — Done',
          `<h1>Payout account ready</h1><p>Return to the LawBid app — clients can now pay you through the platform.</p>${
            link
              ? `<a href="${escapeHtml(link)}"><button type="button">Back to the app</button></a>`
              : ''
          }`,
        ),
      );
  }

  @Get(':id')
  async show(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const fake = this.fake();
    // Owner 2026-10-05: a client → attorney payment (connected account).
    const connected = fake.connectedCheckoutById(id);
    if (connected) {
      const dollars = ((connected.amountTotalCents ?? 0) / 100).toFixed(2);
      res.type('html').send(
        page(
          'LawBid — Pay attorney',
          `<h1>Payment to your attorney</h1><p>$${dollars} — goes straight to the attorney's account.</p>
<form method="post" action="${escapeHtml(encodeURIComponent(id))}/pay"><button type="submit">Pay with test card</button></form>
<div class="test">Test mode — no real charge</div>`,
        ),
      );
      return;
    }
    const s = await fake.retrieveCheckoutSession(id);
    if (!s) throw new NotFoundException();
    // Owner 2026-10-02: one-time case-promotion payment.
    if (s.metadata.kind === 'case_promotion') {
      const dollars = ((s.amountTotalCents ?? 0) / 100).toFixed(2);
      res.type('html').send(
        page(
          'LawBid — Promote case',
          `<h1>Case promotion</h1><p>$${dollars} one-time payment.</p>
<form method="post" action="${escapeHtml(encodeURIComponent(id))}/pay"><button type="submit">Pay with test card</button></form>
<div class="test">Test mode — no real charge</div>`,
        ),
      );
      return;
    }
    res.type('html').send(
      page(
        'LawBid — Subscribe',
        `<h1>Attorney subscription</h1><p>$399 / month. Cancel anytime.</p>
<form method="post" action="${escapeHtml(encodeURIComponent(id))}/pay"><button type="submit">Pay with test card</button></form>
<div class="test">Test mode — no real charge</div>`,
      ),
    );
  }

  @Post(':id/pay')
  async pay(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const fake = this.fake();
    if (fake.connectedCheckoutById(id)) {
      fake.payConnectedCheckout(id);
      const paid = fake.connectedCheckoutById(id);
      if (paid) await this.casePayments?.applyCheckout(paid);
      res
        .type('html')
        .send(
          page(
            'LawBid — Done',
            `<h1>Payment sent</h1><p>Return to the LawBid app — your attorney has been paid.</p>`,
          ),
        );
      return;
    }
    await fake.payCheckout(id);
    const paid = await fake.retrieveCheckoutSession(id);
    if (paid?.metadata.kind === 'case_promotion') {
      await this.promotions?.applyCheckout(paid);
      res
        .type('html')
        .send(
          page(
            'LawBid — Done',
            `<h1>Your case is promoted</h1><p>Return to the LawBid app — attorneys now see your case first.</p>`,
          ),
        );
      return;
    }
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
