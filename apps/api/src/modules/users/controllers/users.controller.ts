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
} from '@nestjs/common';
import type { Request } from 'express';
import { ContactsService } from '../services/contacts.service';
import { ConsentsService } from '../services/consents.service';
import { AccountDeletionService } from '../services/account-deletion.service';
import { ContactRequestDto } from '../dto/contact-request.dto';
import { ContactVerifyDto } from '../dto/contact-verify.dto';
import { SaveConsentsDto } from '../dto/consents.dto';
import { SaveOnboardingStepDto } from '../dto/onboarding.dto';
import { SetRoleDto, UpdateProfileDto } from '../dto/profile.dto';
import { OnboardingService } from '../services/onboarding.service';
import {
  CurrentUser,
  type RequestUser,
} from '../../auth/decorators/current-user.decorator';
import { ReauthRequired } from '../../auth/decorators/reauth-required.decorator';
import { ReauthGuard } from '../../auth/guards/reauth.guard';
import { ReauthVerifier } from '../../auth/services/reauth-verifier.service';
import type { RequestMeta } from '../../auth/services/session.service';

/**
 * docs/01_FOUNDATION_AUTH.md §10.5. Protected by the global JwtAuthGuard
 * (no @Public() anywhere in this controller — every route needs a
 * caller). Account deletion is gated by ReauthGuard + @ReauthRequired();
 * `contacts/request` requires reauth only when it *changes* an already
 * verified contact (see requestContact). Reauth is checked on the request
 * step, not also on `contacts/verify`, so one logical change costs one
 * /auth/reauth round trip.
 */
@Controller('users/me')
export class UsersController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly consents: ConsentsService,
    private readonly accountDeletion: AccountDeletionService,
    private readonly onboarding: OnboardingService,
    private readonly reauth: ReauthVerifier,
  ) {}

  // --- Onboarding (docs/01_FOUNDATION_AUTH.md §11, stage 1.7) ---

  @Get()
  async me(@CurrentUser() user: RequestUser) {
    return this.onboarding.getMe(user.sub);
  }

  @Patch()
  async updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateProfileDto,
  ) {
    await this.onboarding.updateProfile(user.sub, dto);
    return this.onboarding.getMe(user.sub);
  }

  @Post('role')
  @HttpCode(HttpStatus.OK)
  async setRole(@CurrentUser() user: RequestUser, @Body() dto: SetRoleDto) {
    await this.onboarding.setRole(user.sub, dto.role);
    return this.onboarding.getMe(user.sub);
  }

  @Patch('onboarding')
  async saveOnboardingStep(
    @CurrentUser() user: RequestUser,
    @Body() dto: SaveOnboardingStepDto,
  ) {
    await this.onboarding.saveStep(user.sub, dto);
    return this.onboarding.getMe(user.sub);
  }

  @Post('onboarding/complete')
  @HttpCode(HttpStatus.OK)
  async completeOnboarding(@CurrentUser() user: RequestUser) {
    await this.onboarding.complete(user.sub);
    return this.onboarding.getMe(user.sub);
  }

  /** docs/01 §11 step 3A: "Изменить телефон/email можно только с повторной
   * проверкой (reauth + код на новый контакт)". Adding the FIRST contact of
   * a type during onboarding needs no reauth (it would cost an extra paid
   * code per contact); replacing an already-verified one does. */
  @Post('contacts/request')
  async requestContact(
    @CurrentUser() user: RequestUser,
    @Body() dto: ContactRequestDto,
    @Req() req: Request & { user?: RequestUser },
  ) {
    if (await this.contacts.hasVerified(user.sub, dto.type)) {
      await this.reauth.assertAndConsume(req);
    }
    await this.contacts.requestVerification(user.sub, dto.type, dto.value);
    return { sent: true };
  }

  @Post('contacts/verify')
  async verifyContact(
    @CurrentUser() user: RequestUser,
    @Body() dto: ContactVerifyDto,
  ) {
    await this.contacts.verify(user.sub, dto.type, dto.value, dto.code);
    return { verified: true };
  }

  @Post('consents')
  async saveConsents(
    @CurrentUser() user: RequestUser,
    @Body() dto: SaveConsentsDto,
    @Req() req: Request,
  ) {
    await this.consents.save(user.sub, dto, this.meta(req));
    return { saved: true };
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @UseGuards(ReauthGuard)
  @ReauthRequired()
  async deleteAccount(@CurrentUser() user: RequestUser, @Req() req: Request) {
    await this.accountDeletion.requestDeletion(user.sub, this.meta(req));
    return { deletionPending: true };
  }

  private meta(req: Request): RequestMeta {
    return { ip: req.ip, userAgent: req.header('user-agent') };
  }
}
