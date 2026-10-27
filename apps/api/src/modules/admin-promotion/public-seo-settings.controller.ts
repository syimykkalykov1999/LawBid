import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  COMMON_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { Public } from '../auth/decorators/public.decorator';
import { PublicSeoSettingsDto } from './promotion.dto';
import { PromotionService } from './promotion.service';

/** The generator runs once a day; five minutes of CDN cache is plenty. */
const CACHE_SECONDS = 300;

/**
 * Owner 2026-10-27: the switches the owner set on «Продвижение», read by
 * the static-page generator (scripts/seo/resolve-switches.mjs). Public and
 * read-only: six on/off/number values and nothing about people. A value is
 * null until the owner decides; the repository variable applies then.
 */
@ApiTags('public')
@ApiErrors(COMMON_ERRORS)
@Controller('public/seo-settings')
export class PublicSeoSettingsController {
  constructor(private readonly promotion: PromotionService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get()
  @ApiEnvelopeResponse(PublicSeoSettingsDto, {
    description:
      'SEO switches set in the admin; null = not decided (repository variable applies).',
  })
  async getPublicSeoSettings(@Res() res: Response): Promise<void> {
    const data = await this.promotion.publicSettings();
    res.set('Cache-Control', `public, max-age=${CACHE_SECONDS}`);
    res.status(200).json({ data });
  }
}
