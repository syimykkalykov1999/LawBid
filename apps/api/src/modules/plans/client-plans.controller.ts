import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
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
  ClientPlanCheckoutDto,
  ClientPlanCheckoutRequestDto,
  ClientPlanCompleteDto,
  ClientPlanMeDto,
} from './client-plans.dto';
import { PortalSessionDto } from '../billing/billing.dto';
import { ClientPlansService } from './client-plans.service';

const E = ErrorCode;

/** Owner 2026-10-05: the client's plan (badge, cases first, …). */
@ApiTags('plans')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('client-plans')
export class ClientPlansController {
  constructor(private readonly plans: ClientPlansService) {}

  @Get('me')
  @ApiOperation({
    summary: "The client's plan, entitlements and the plans for sale",
  })
  @ApiEnvelopeResponse(ClientPlanMeDto)
  @ApiErrors({ 403: [E.FORBIDDEN] })
  clientPlanMe(@CurrentUser() user: RequestUser): Promise<ClientPlanMeDto> {
    return this.plans.me(user);
  }

  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Stripe's hosted page for a client plan" })
  @ApiEnvelopeResponse(ClientPlanCheckoutDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    409: [E.PLAN_NOT_AVAILABLE, E.SUBSCRIPTION_ALREADY_ACTIVE],
    503: [E.PAYMENTS_NOT_CONFIGURED],
  })
  clientPlanCheckout(
    @CurrentUser() user: RequestUser,
    @Body() dto: ClientPlanCheckoutRequestDto,
  ): Promise<ClientPlanCheckoutDto> {
    return this.plans.checkout(user, dto.planCode);
  }

  @Post('checkout/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Back from the payment page: apply the paid session',
  })
  @ApiEnvelopeResponse(ClientPlanMeDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  clientPlanCheckoutComplete(
    @CurrentUser() user: RequestUser,
    @Body() dto: ClientPlanCompleteDto,
  ): Promise<ClientPlanMeDto> {
    return this.plans.completeCheckout(user, dto.sessionId);
  }

  @Post('portal-session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Stripe Customer Portal URL of the client (card, invoices)',
  })
  @ApiEnvelopeResponse(PortalSessionDto)
  @ApiErrors({
    403: [E.FORBIDDEN],
    404: [E.SUBSCRIPTION_NOT_FOUND],
    503: [E.PAYMENTS_NOT_CONFIGURED],
  })
  clientPlanPortalSession(
    @CurrentUser() user: RequestUser,
  ): Promise<PortalSessionDto> {
    return this.plans.portalSession(user);
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Stop renewing (the plan stays until the period ends)',
  })
  @ApiEnvelopeResponse(ClientPlanMeDto)
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.SUBSCRIPTION_NOT_FOUND] })
  clientPlanCancel(@CurrentUser() user: RequestUser): Promise<ClientPlanMeDto> {
    return this.plans.setCancel(user, true);
  }

  @Post('resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Keep the plan (undo a cancel)' })
  @ApiEnvelopeResponse(ClientPlanMeDto)
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.SUBSCRIPTION_NOT_FOUND] })
  clientPlanResume(@CurrentUser() user: RequestUser): Promise<ClientPlanMeDto> {
    return this.plans.setCancel(user, false);
  }
}
