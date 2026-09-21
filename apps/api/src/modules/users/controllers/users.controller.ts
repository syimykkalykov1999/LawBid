import {
  Body,
  Controller,
  Delete,
  HttpCode,
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
import {
  CurrentUser,
  type RequestUser,
} from '../../auth/decorators/current-user.decorator';
import { ReauthRequired } from '../../auth/decorators/reauth-required.decorator';
import { ReauthGuard } from '../../auth/guards/reauth.guard';
import type { RequestMeta } from '../../auth/services/session.service';

/**
 * docs/01_FOUNDATION_AUTH.md §10.5. Protected by the global JwtAuthGuard
 * (no @Public() anywhere in this controller — every route needs a
 * caller). ReauthGuard + @ReauthRequired() additionally gate the two
 * routes §10.1 names as sensitive: changing a contact and deleting the
 * account. Reauth is required on `contacts/request` (gates entry into the
 * contact-change flow) rather than also on `contacts/verify` — see
 * ContactsService's class doc for why duplicating it on both steps would
 * just force the client through two separate /auth/reauth round trips
 * for one logical action.
 */
@Controller('users/me')
export class UsersController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly consents: ConsentsService,
    private readonly accountDeletion: AccountDeletionService,
  ) {}

  @Post('contacts/request')
  @UseGuards(ReauthGuard)
  @ReauthRequired()
  async requestContact(
    @CurrentUser() user: RequestUser,
    @Body() dto: ContactRequestDto,
  ) {
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
