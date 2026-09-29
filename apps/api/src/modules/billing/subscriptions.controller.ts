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
  ConfirmSubscriptionDto,
  PaymentDto,
  PaymentsQueryDto,
  PortalSessionDto,
  StartSubscriptionResultDto,
  SubscriptionMeDto,
  type PaymentsPage,
} from './billing.dto';
import { SubscriptionsService } from './subscriptions.service';

const E = ErrorCode;
const ATTORNEY_ERRORS = {
  403: [E.FORBIDDEN, E.ATTORNEY_NOT_VERIFIED],
  503: [E.PAYMENTS_NOT_CONFIGURED],
};

/** docs/06 §1.4 — the attorney's subscription (mobile). */
@ApiTags('subscriptions')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

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
}
