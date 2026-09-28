import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiHeader, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  COMMON_ERRORS,
} from '../../../common/dto/api-docs.decorators';
import { Public } from '../../auth/decorators/public.decorator';
import { PracticeAreaCategoryDto } from '../dto/practice-areas.dto';
import {
  PRACTICE_TREE_CACHE_TTL_SECONDS,
  PracticeAreasService,
} from '../services/practice-areas.service';

/**
 * GET /practice-areas (docs/03 §4.3 "дерево практик (с i18n), кэш
 * ETag"). Public reference data: the client's case form (docs/04) and
 * the attorney's practice picker both need it, and it holds nothing
 * personal. Raw response (@Res) only to send an empty 304 on a matching
 * If-None-Match — same pattern as GET /i18n/bundle/:lang.
 */
@ApiTags('practice-areas')
@ApiErrors(COMMON_ERRORS)
@Controller('practice-areas')
export class PracticeAreasController {
  constructor(private readonly practices: PracticeAreasService) {}

  @Public()
  @Get()
  @ApiEnvelopeResponse(PracticeAreaCategoryDto, {
    isArray: true,
    description:
      'Active categories with their active specializations, sorted; `ETag` header.',
  })
  @ApiResponse({
    status: 304,
    description: 'Not modified: If-None-Match equals the current ETag.',
  })
  @ApiHeader({
    name: 'If-None-Match',
    required: false,
    description: 'ETag of the tree the client already has.',
  })
  async listPracticeAreas(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const tree = await this.practices.tree();
    res.set('ETag', tree.etag);
    res.set(
      'Cache-Control',
      `public, max-age=${PRACTICE_TREE_CACHE_TTL_SECONDS}`,
    );
    if (req.header('if-none-match') === tree.etag) {
      res.status(304).end();
      return;
    }
    res.status(200).json({ data: tree.categories });
  }
}
