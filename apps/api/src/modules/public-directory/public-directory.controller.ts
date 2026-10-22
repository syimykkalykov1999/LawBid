import { Controller, Get, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  COMMON_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { Public } from '../auth/decorators/public.decorator';
import {
  PublicAttorneyDto,
  PublicAttorneysQueryDto,
} from './public-directory.dto';
import { PublicDirectoryService } from './public-directory.service';

/** Cached by the CDN for an hour: the data only feeds static pages. */
const CACHE_SECONDS = 3600;

@ApiTags('public')
@ApiErrors(COMMON_ERRORS)
@Controller('public/directory')
export class PublicDirectoryController {
  constructor(private readonly directory: PublicDirectoryService) {}

  @Public()
  // Security research #5 (2026-10-22), A5: a scraper walking the catalog
  // page by page (the CDN caches an hour, so a browser rarely gets here).
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('attorneys')
  @ApiEnvelopeResponse(PublicAttorneyDto, {
    isArray: true,
    description:
      'Verified attorneys, best first; the public facts of their profile. `meta.nextCursor` for the next page.',
  })
  async listPublicAttorneys(
    @Query() query: PublicAttorneysQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const page = await this.directory.attorneys(query);
    res.set('Cache-Control', `public, max-age=${CACHE_SECONDS}`);
    res.status(200).json({
      data: page.items,
      meta: { nextCursor: page.nextCursor },
    });
  }
}
