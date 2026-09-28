import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  ConsentsSavedDto,
  ContactCodeSentDto,
  ContactVerifiedDto,
  DeletionPendingDto,
  IdentifierDto,
  MeDto,
} from '../dto/user-responses.dto';
import { IdempotencyInterceptor } from '../../../idempotency/idempotency.interceptor';
import { ContactsService } from '../services/contacts.service';
import { ConsentsService } from '../services/consents.service';
import { AccountDeletionService } from '../services/account-deletion.service';
import { ContactRequestDto } from '../dto/contact-request.dto';
import { ContactVerifyDto } from '../dto/contact-verify.dto';
import { SaveConsentsDto } from '../dto/consents.dto';
import { SaveOnboardingStepDto } from '../dto/onboarding.dto';
import { SetRoleDto, UpdateProfileDto } from '../dto/profile.dto';
import { OnboardingService } from '../services/onboarding.service';
import { AccountIdentifiersService } from '../services/account-identifiers.service';
import {
  CurrentUser,
  type RequestUser,
} from '../../auth/decorators/current-user.decorator';
import { ReauthRequired } from '../../auth/decorators/reauth-required.decorator';
import { ReauthGuard } from '../../auth/guards/reauth.guard';
import { ReauthVerifier } from '../../auth/services/reauth-verifier.service';
import type { RequestMeta } from '../../auth/services/session.service';

const E = ErrorCode;
/** docs/01 §11 step 3A: ReauthGuard / ReauthVerifier (header name =
 * reauth-verifier.service.ts REAUTH_HEADER). */
const REAUTH_HEADER_NAME = 'X-Reauth-Token';
const IdempotencyKeyHeader = ApiHeader({
  name: 'Idempotency-Key',
  required: false,
  description:
    'Resource-creating POST: a retry with the same key and body is applied once (see IdempotencyInterceptor).',
});

/**
 * docs/01_FOUNDATION_AUTH.md §10.5. Protected by the global JwtAuthGuard
 * (no @Public() anywhere in this controller — every route needs a
 * caller). Account deletion is gated by ReauthGuard + @ReauthRequired();
 * `contacts/request` requires reauth only when it *changes* an already
 * verified contact (see requestContact). Reauth is checked on the request
 * step, not also on `contacts/verify`, so one logical change costs one
 * /auth/reauth round trip.
 *
 * IdempotencyInterceptor guards the POSTs the app sends with an
 * Idempotency-Key (.cursorrules "Все POST, создающие ресурс/деньги"):
 * role, onboarding/complete, consents (append-only rows) and
 * contacts/request (a paid SMS/email send).
 */
@ApiTags('users')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('users/me')
export class UsersController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly consents: ConsentsService,
    private readonly accountDeletion: AccountDeletionService,
    private readonly onboarding: OnboardingService,
    private readonly reauth: ReauthVerifier,
    private readonly identifiers: AccountIdentifiersService,
  ) {}

  // --- Onboarding (docs/01_FOUNDATION_AUTH.md §11, stage 1.7) ---

  @Get()
  @ApiEnvelopeResponse(MeDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async me(@CurrentUser() user: RequestUser): Promise<MeDto> {
    return this.onboarding.getMe(user.sub);
  }

  /** docs/01 §10.3: Settings → Account lists the linked sign-in methods.
   * Linking more goes through POST /auth/identifiers; changing the phone/
   * email contact through contacts/request (+ reauth) and contacts/verify. */
  @Get('identifiers')
  @ApiEnvelopeResponse(IdentifierDto, { isArray: true })
  async listIdentifiers(
    @CurrentUser() user: RequestUser,
  ): Promise<IdentifierDto[]> {
    return this.identifiers.list(user.sub);
  }

  @Patch()
  @ApiEnvelopeResponse(MeDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.I18N_LANGUAGE_NOT_FOUND],
    404: [E.NOT_FOUND],
    409: [E.FILE_NOT_ATTACHABLE],
  })
  async updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<MeDto> {
    await this.onboarding.updateProfile(user.sub, dto);
    return this.onboarding.getMe(user.sub);
  }

  @Post('role')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @IdempotencyKeyHeader
  @ApiEnvelopeResponse(MeDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.ROLE_ALREADY_SET, E.IDEMPOTENCY_KEY_CONFLICT],
  })
  async setRole(
    @CurrentUser() user: RequestUser,
    @Body() dto: SetRoleDto,
  ): Promise<MeDto> {
    await this.onboarding.setRole(user.sub, dto.role);
    return this.onboarding.getMe(user.sub);
  }

  @Patch('onboarding')
  @ApiEnvelopeResponse(MeDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async saveOnboardingStep(
    @CurrentUser() user: RequestUser,
    @Body() dto: SaveOnboardingStepDto,
  ): Promise<MeDto> {
    await this.onboarding.saveStep(user.sub, dto);
    return this.onboarding.getMe(user.sub);
  }

  @Post('onboarding/complete')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @IdempotencyKeyHeader
  @ApiEnvelopeResponse(MeDto)
  @ApiErrors({
    403: [E.CLIENT_CONTACTS_INCOMPLETE, E.ONBOARDING_INCOMPLETE],
    404: [E.NOT_FOUND],
    409: [E.IDEMPOTENCY_KEY_CONFLICT],
  })
  async completeOnboarding(@CurrentUser() user: RequestUser): Promise<MeDto> {
    await this.onboarding.complete(user.sub);
    return this.onboarding.getMe(user.sub);
  }

  /** docs/01 §11 step 3A: "Изменить телефон/email можно только с повторной
   * проверкой (reauth + код на новый контакт)". Adding the FIRST contact of
   * a type during onboarding needs no reauth (it would cost an extra paid
   * code per contact); replacing an already-verified one does. */
  @Post('contacts/request')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiEnvelopeResponse(ContactCodeSentDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.PHONE_COUNTRY_NOT_SUPPORTED],
    401: [
      E.UNAUTHORIZED,
      E.TOKEN_EXPIRED,
      E.AUTH_SESSION_REVOKED,
      E.REAUTH_INVALID,
    ],
    403: [E.REAUTH_REQUIRED, E.CONTACT_DOMAIN_BLOCKED],
    409: [E.CONTACT_ALREADY_EXISTS, E.IDEMPOTENCY_KEY_CONFLICT],
    429: [E.AUTH_OTP_REQUEST_LIMIT, E.RATE_LIMITED],
    503: [E.PROVIDER_BUDGET_EXCEEDED],
  })
  @ApiHeader({
    name: REAUTH_HEADER_NAME,
    required: false,
    description:
      'Single-use token from POST /auth/reauth; required only when replacing an already verified contact of this type.',
  })
  @IdempotencyKeyHeader
  async requestContact(
    @CurrentUser() user: RequestUser,
    @Body() dto: ContactRequestDto,
    @Req() req: Request & { user?: RequestUser },
  ): Promise<ContactCodeSentDto> {
    if (await this.contacts.hasVerified(user.sub, dto.type)) {
      await this.reauth.assertAndConsume(req);
    }
    await this.contacts.requestVerification(user.sub, dto.type, dto.value);
    return { sent: true };
  }

  @Post('contacts/verify')
  @ApiEnvelopeResponse(ContactVerifiedDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    401: [
      E.UNAUTHORIZED,
      E.TOKEN_EXPIRED,
      E.AUTH_SESSION_REVOKED,
      E.AUTH_OTP_INVALID,
      E.AUTH_OTP_EXPIRED,
    ],
    409: [E.CONTACT_ALREADY_EXISTS],
    423: [E.AUTH_OTP_LOCKED],
  })
  async verifyContact(
    @CurrentUser() user: RequestUser,
    @Body() dto: ContactVerifyDto,
  ): Promise<ContactVerifiedDto> {
    await this.contacts.verify(user.sub, dto.type, dto.value, dto.code);
    return { verified: true };
  }

  @Post('consents')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiEnvelopeResponse(ConsentsSavedDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.IDEMPOTENCY_KEY_CONFLICT],
  })
  @IdempotencyKeyHeader
  async saveConsents(
    @CurrentUser() user: RequestUser,
    @Body() dto: SaveConsentsDto,
    @Req() req: Request,
  ): Promise<ConsentsSavedDto> {
    await this.consents.save(user.sub, dto, this.meta(req));
    return { saved: true };
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @UseGuards(ReauthGuard)
  @ReauthRequired()
  @ApiEnvelopeResponse(DeletionPendingDto)
  @ApiErrors({
    401: [
      E.UNAUTHORIZED,
      E.TOKEN_EXPIRED,
      E.AUTH_SESSION_REVOKED,
      E.REAUTH_INVALID,
    ],
    403: [E.REAUTH_REQUIRED],
  })
  @ApiHeader({
    name: REAUTH_HEADER_NAME,
    required: true,
    description: 'Single-use token from POST /auth/reauth (docs/01 §10.7).',
  })
  async deleteAccount(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<DeletionPendingDto> {
    await this.accountDeletion.requestDeletion(user.sub, this.meta(req));
    return { deletionPending: true };
  }

  private meta(req: Request): RequestMeta {
    return { ip: req.ip, userAgent: req.header('user-agent') };
  }
}
