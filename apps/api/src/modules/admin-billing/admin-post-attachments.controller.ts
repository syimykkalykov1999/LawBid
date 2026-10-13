import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { AppSettingsWriter } from '../../common/app-settings/app-settings.writer';
import { ApiEnvelopeResponse } from '../../common/dto/api-docs.decorators';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  POST_ATTACHMENT_MODES,
  type PostAttachmentMode,
} from '../posts/post-attachments.policy';

export class PostAttachmentsModeDto {
  @ApiProperty({ enum: POST_ATTACHMENT_MODES })
  @IsIn(POST_ATTACHMENT_MODES)
  mode!: PostAttachmentMode;
}

/**
 * Owner 2026-10-13: Деньги → Планы → «Вложения в постах и рилсах»: who may
 * add documents and extra photos to a post or a reel. The per-plan switch
 * is the `post_attachments` entitlement of the plan editor.
 */
@ApiTags('admin-billing')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/billing/post-attachments')
export class AdminPostAttachmentsController {
  constructor(
    private readonly settings: AppSettingsService,
    private readonly writer: AppSettingsWriter,
  ) {}

  @Get()
  @ApiOperation({ summary: 'The attachments-in-posts mode' })
  @ApiEnvelopeResponse(PostAttachmentsModeDto)
  async getPostAttachmentsMode(): Promise<PostAttachmentsModeDto> {
    const raw = await this.settings.string('attachments_in_posts');
    return {
      mode: (POST_ATTACHMENT_MODES as readonly string[]).includes(raw)
        ? (raw as PostAttachmentMode)
        : 'off_for_all',
    };
  }

  @Put()
  @ApiOperation({ summary: 'Set the attachments-in-posts mode' })
  @ApiEnvelopeResponse(PostAttachmentsModeDto)
  async setPostAttachmentsMode(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: PostAttachmentsModeDto,
  ): Promise<PostAttachmentsModeDto> {
    await this.writer.write(admin.id, 'post_attachments.mode', {
      attachments_in_posts: dto.mode,
    });
    return { mode: dto.mode };
  }
}
