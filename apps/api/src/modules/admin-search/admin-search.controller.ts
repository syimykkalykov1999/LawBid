import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AdminEndpoint } from '../admin-auth/admin-auth.decorators';
import {
  AddSynonymTermDto,
  CreateSynonymGroupDto,
  ImportSynonymsDto,
  ImportSynonymsResultDto,
  SearchLearnedLinkDto,
  SearchOverviewDto,
  SearchQueryStatDto,
  SearchStatsQueryDto,
  SynonymGroupDto,
  SynonymGroupPageDto,
  SynonymIdParamDto,
  SynonymListQueryDto,
  SynonymTestDto,
  SynonymTestQueryDto,
  UpdateSynonymGroupDto,
} from './admin-search.dto';
import { AdminSearchService } from './admin-search.service';

const E = ErrorCode;

/** Owner 2026-10-15 — admin panel → Search: synonyms (live, no release),
 * what people searched and did not find, what the search learned. Every
 * change is audited by the interceptor. */
@ApiTags('admin-search')
@AdminEndpoint('super_admin', 'moderator')
@Controller('admin/search')
export class AdminSearchController {
  constructor(private readonly search: AdminSearchService) {}

  @Get('synonyms')
  @ApiOperation({ summary: 'Synonym groups with their phrases' })
  @ApiEnvelopeResponse(SynonymGroupDto, { isArray: true })
  listSynonyms(@Query() q: SynonymListQueryDto): Promise<SynonymGroupPageDto> {
    return this.search.list(q);
  }

  @Get('synonyms/test')
  @ApiOperation({ summary: 'What a search for this text would understand' })
  @ApiEnvelopeResponse(SynonymTestDto)
  testSynonyms(@Query() q: SynonymTestQueryDto): Promise<SynonymTestDto> {
    return this.search.test(q.q);
  }

  @Post('synonyms')
  @ApiOperation({ summary: 'Add a group of words (live at once)' })
  @ApiEnvelopeResponse(SynonymGroupDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.VALIDATION_ERROR],
  })
  createSynonym(@Body() dto: CreateSynonymGroupDto): Promise<SynonymGroupDto> {
    return this.search.create(dto);
  }

  @Post('synonyms/import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk add groups and phrases (the multilingual dictionary file)',
  })
  @ApiEnvelopeResponse(ImportSynonymsResultDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  importSynonyms(
    @Body() dto: ImportSynonymsDto,
  ): Promise<ImportSynonymsResultDto> {
    return this.search.importGroups(dto);
  }

  @Patch('synonyms/:id')
  @ApiOperation({ summary: 'Change a group: topic, on/off, its phrases' })
  @ApiEnvelopeResponse(SynonymGroupDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  updateSynonym(
    @Param() p: SynonymIdParamDto,
    @Body() dto: UpdateSynonymGroupDto,
  ): Promise<SynonymGroupDto> {
    return this.search.update(p.id, dto);
  }

  @Post('synonyms/:id/terms')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add one phrase to a group' })
  @ApiEnvelopeResponse(SynonymGroupDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  addSynonymTerm(
    @Param() p: SynonymIdParamDto,
    @Body() dto: AddSynonymTermDto,
  ): Promise<SynonymGroupDto> {
    return this.search.addTerm(p.id, dto);
  }

  @Delete('synonyms/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a group with its phrases' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  removeSynonym(@Param() p: SynonymIdParamDto): Promise<void> {
    return this.search.remove(p.id);
  }

  @Get('overview')
  @ApiOperation({ summary: 'Queries, empty ones and opened results' })
  @ApiEnvelopeResponse(SearchOverviewDto)
  searchOverview(@Query() q: SearchStatsQueryDto): Promise<SearchOverviewDto> {
    return this.search.overview(q.days ?? 7);
  }

  @Get('no-results')
  @ApiOperation({ summary: 'Queries that found nothing, most frequent first' })
  @ApiEnvelopeResponse(SearchQueryStatDto, { isArray: true })
  searchNoResults(
    @Query() q: SearchStatsQueryDto,
  ): Promise<SearchQueryStatDto[]> {
    return this.search.noResults(q.days ?? 7);
  }

  @Get('top')
  @ApiOperation({ summary: 'What people search for most' })
  @ApiEnvelopeResponse(SearchQueryStatDto, { isArray: true })
  searchTop(@Query() q: SearchStatsQueryDto): Promise<SearchQueryStatDto[]> {
    return this.search.top(q.days ?? 7);
  }

  @Get('learned')
  @ApiOperation({ summary: 'Query → topic links learned from clicks' })
  @ApiEnvelopeResponse(SearchLearnedLinkDto, { isArray: true })
  searchLearned(): Promise<SearchLearnedLinkDto[]> {
    return this.search.learned();
  }
}
