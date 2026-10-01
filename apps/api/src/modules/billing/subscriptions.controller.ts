import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import {
  CheckoutRequestDto,
  CheckoutSessionDto,
  SetSeatsDto,
  CompleteCheckoutDto,
  ConfirmSubscriptionDto,
  PaymentDto,
  PaymentsQueryDto,
  PortalSessionDto,
  StartSubscriptionResultDto,
  SubscriptionMeDto,
  type PaymentsPage,
} from './billing.dto';
import { SubscriptionsService } from './subscriptions.service';
import { AttorneyOnly } from '../auth/assistant/assistant-context';

const E = ErrorCode;
const ATTORNEY_ERRORS = {
  403: [E.FORBIDDEN, E.ATTORNEY_NOT_VERIFIED],
  503: [E.PAYMENTS_NOT_CONFIGURED],
};

/** docs/06 §1.4 — the attorney's subscription (mobile). */
@ApiTags('subscriptions')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@AttorneyOnly()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Stripe's hosted payment page for the subscription (owner 2026-09-30)",
  })
  @ApiEnvelopeResponse(CheckoutSessionDto)
  @ApiErrors({
    ...ATTORNEY_ERRORS,
    400: [E.VALIDATION_ERROR],
    409: [E.SUBSCRIPTION_ALREADY_ACTIVE],
  })
  createCheckout(
    @CurrentUser() user: RequestUser,
    @Body() dto: CheckoutRequestDto,
  ): Promise<CheckoutSessionDto> {
    return this.subscriptions.checkout(user, dto);
  }

  @Post('plan/yearly')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Monthly → yearly "Prime" (attorney + 6 assistants)',
  })
  @ApiEnvelopeResponse(SubscriptionMeDto)
  @ApiErrors({
    ...ATTORNEY_ERRORS,
    404: [E.SUBSCRIPTION_NOT_FOUND],
    409: [E.SUBSCRIPTION_PLAN_INCLUDES_SEATS],
  })
  switchToYearly(@CurrentUser() user: RequestUser): Promise<SubscriptionMeDto> {
    return this.subscriptions.switchToYearly(user);
  }

  @Post('seats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Monthly plan: set the number of assistant seats (OQ-048)',
  })
  @ApiEnvelopeResponse(SubscriptionMeDto)
  @ApiErrors({
    ...ATTORNEY_ERRORS,
    400: [E.VALIDATION_ERROR],
    404: [E.SUBSCRIPTION_NOT_FOUND],
    409: [E.SUBSCRIPTION_PLAN_INCLUDES_SEATS, E.ASSISTANT_SEATS_IN_USE],
  })
  setSeats(
    @CurrentUser() user: RequestUser,
    @Body() dto: SetSeatsDto,
  ): Promise<SubscriptionMeDto> {
    return this.subscriptions.setSeats(user, dto.seats);
  }

  @Post('checkout/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Back from the payment page: apply the paid session',
  })
  @ApiEnvelopeResponse(SubscriptionMeDto)
  @ApiErrors({ ...ATTORNEY_ERRORS, 400: [E.VALIDATION_ERROR] })
  completeCheckout(
    @CurrentUser() user: RequestUser,
    @Body() dto: CompleteCheckoutDto,
  ): Promise<SubscriptionMeDto> {
    return this.subscriptions.completeCheckout(user, dto.sessionId);
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Customer + SetupIntent for the PaymentSheet; trial eligibility',
  })
  @ApiEnvelopeResponse(StartSubscriptionResultDto)
  @ApiErrors({ ...ATTORNEY_ERRORS, 409: [E.SUBSCRIPTION_ALREADY_ACTIVE] })
  startSubscription(
    @CurrentUser() user: RequestUser,
  ): Promise<StartSubscriptionResultDto> {
    return this.subscriptions.start(user);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Card confirmed → create the subscription (7-day trial when eligible)',
  })
  @ApiEnvelopeResponse(SubscriptionMeDto)
  @ApiErrors({
    ...ATTORNEY_ERRORS,
    400: [E.VALIDATION_ERROR],
    409: [
      E.SUBSCRIPTION_ALREADY_ACTIVE,
      E.SUBSCRIPTION_SETUP_INCOMPLETE,
      E.SUBSCRIPTION_TRIAL_UNAVAILABLE,
    ],
  })
  confirmSubscription(
    @CurrentUser() user: RequestUser,
    @Body() dto: ConfirmSubscriptionDto,
  ): Promise<SubscriptionMeDto> {
    return this.subscriptions.confirm(
      user,
      dto.setupIntentId,
      dto.chargeNow === true,
    );
  }

  @Get('me')
  @ApiOperation({ summary: 'Current subscription and access verdict' })
  @ApiEnvelopeResponse(SubscriptionMeDto)
  mySubscription(@CurrentUser() user: RequestUser): Promise<SubscriptionMeDto> {
    return this.subscriptions.me(user);
  }

  @Get('payments')
  @ApiOperation({ summary: 'Payment history (cursor)' })
  @ApiEnvelopeResponse(PaymentDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  myPayments(
    @CurrentUser() user: RequestUser,
    @Query() q: PaymentsQueryDto,
  ): Promise<PaymentsPage> {
    return this.subscriptions.payments(user, q.cursor);
  }

  @Post('portal-session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Stripe Customer Portal URL (card, invoices, cancel)',
  })
  @ApiEnvelopeResponse(PortalSessionDto)
  @ApiErrors(ATTORNEY_ERRORS)
  portalSession(@CurrentUser() user: RequestUser): Promise<PortalSessionDto> {
    return this.subscriptions.portalSession(user);
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel at period end (access stays until then)' })
  @ApiEnvelopeResponse(SubscriptionMeDto)
  @ApiErrors({ 404: [E.SUBSCRIPTION_NOT_FOUND] })
  cancelSubscription(
    @CurrentUser() user: RequestUser,
  ): Promise<SubscriptionMeDto> {
    return this.subscriptions.cancel(user);
  }

  @Post('resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Keep the subscription (undo a cancel)' })
  @ApiEnvelopeResponse(SubscriptionMeDto)
  @ApiErrors({ 404: [E.SUBSCRIPTION_NOT_FOUND] })
  resumeSubscription(
    @CurrentUser() user: RequestUser,
  ): Promise<SubscriptionMeDto> {
    return this.subscriptions.resume(user);
  }
}
