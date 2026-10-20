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
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import { RequireIdempotencyKeyGuard } from '../../idempotency/require-idempotency-key.guard';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { UserBriefDto } from '../user-brief/user-brief.dto';
import { VideoUploadDto } from '../videos/videos.dto';
import {
  CreateStoryDto,
  CreateStoryVideoUploadDto,
  StoryDto,
  StoryIdParamDto,
  StoryPageQueryDto,
  StorySettingsDto,
  StoryTrayItemDto,
  StoryUserIdParamDto,
  StoryViewerDto,
  UpdateStorySettingsDto,
} from './stories.dto';
import { StoriesService, type StoryPage } from './stories.service';

const E = ErrorCode;

/** Owner 2026-10-20 — stories (24 h). */
@ApiTags('stories')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('stories')
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  @Get('tray')
  @ApiOperation({ summary: 'Story bubbles: me first, then people I follow' })
  @ApiEnvelopeResponse(StoryTrayItemDto, { isArray: true })
  @ApiErrors({ 403: [E.FEATURE_DISABLED] })
  storyTray(@CurrentUser() user: RequestUser): Promise<StoryTrayItemDto[]> {
    return this.stories.tray(user);
  }

  @Get('archive')
  @ApiOperation({ summary: 'My expired stories, newest first' })
  @ApiEnvelopeResponse(StoryDto, { isArray: true })
  storyArchive(
    @CurrentUser() user: RequestUser,
    @Query() q: StoryPageQueryDto,
  ): Promise<StoryPage<StoryDto>> {
    return this.stories.archive(user, q.cursor, q.limit);
  }

  @Get('settings')
  @ApiOperation({ summary: 'My story privacy' })
  @ApiEnvelopeResponse(StorySettingsDto)
  storySettings(@CurrentUser() user: RequestUser): Promise<StorySettingsDto> {
    return this.stories.getSettings(user);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Change my story privacy' })
  @ApiEnvelopeResponse(StorySettingsDto)
  storyUpdateSettings(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateStorySettingsDto,
  ): Promise<StorySettingsDto> {
    return this.stories.updateSettings(user, dto);
  }

  @Get('hidden')
  @ApiOperation({ summary: 'People my stories are hidden from' })
  @ApiEnvelopeResponse(UserBriefDto, { isArray: true })
  storyHidden(@CurrentUser() user: RequestUser): Promise<UserBriefDto[]> {
    return this.stories.hiddenFrom(user);
  }

  @Put('hidden/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hide my stories from a person' })
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.STORY_LIMIT_REACHED] })
  storyHide(
    @CurrentUser() user: RequestUser,
    @Param() p: StoryUserIdParamDto,
  ): Promise<void> {
    return this.stories.hide(user, p.userId);
  }

  @Delete('hidden/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Show my stories to a person again' })
  storyUnhide(
    @CurrentUser() user: RequestUser,
    @Param() p: StoryUserIdParamDto,
  ): Promise<void> {
    return this.stories.unhide(user, p.userId);
  }

  @Post('video-uploads')
  @ApiOperation({ summary: 'Start a direct upload of a story video (≤ 15 s)' })
  @ApiEnvelopeResponse(VideoUploadDto, { status: 201 })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.VIDEO_UNAVAILABLE, E.FEATURE_DISABLED],
    409: [E.VIDEO_NOT_READY],
    422: [E.VIDEO_TOO_LONG],
    429: [E.RATE_LIMITED],
    503: [E.VIDEO_UNAVAILABLE],
  })
  storyCreateVideoUpload(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateStoryVideoUploadDto,
  ): Promise<VideoUploadDto> {
    return this.stories.createVideoUpload(user, dto);
  }

  @Post()
  @UseGuards(RequireIdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Post a story' })
  @ApiEnvelopeResponse(StoryDto, { status: 201 })
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.VIDEO_TOO_LONG],
    403: [E.FEATURE_DISABLED, E.ASSISTANT_NOT_ALLOWED],
    404: [E.NOT_FOUND],
    409: [E.STORY_LIMIT_REACHED, E.FILE_NOT_ATTACHABLE, E.VIDEO_NOT_READY],
    429: [E.RATE_LIMITED],
  })
  storyCreate(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateStoryDto,
  ): Promise<StoryDto> {
    return this.stories.create(user, dto);
  }

  @Get('users/:userId')
  @ApiOperation({ summary: "A person's live stories I may see" })
  @ApiEnvelopeResponse(StoryDto, { isArray: true })
  storyOfUser(
    @CurrentUser() user: RequestUser,
    @Param() p: StoryUserIdParamDto,
  ): Promise<StoryDto[]> {
    return this.stories.ofUser(user, p.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete my story' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  storyRemove(
    @CurrentUser() user: RequestUser,
    @Param() p: StoryIdParamDto,
  ): Promise<void> {
    return this.stories.remove(user, p.id);
  }

  @Post(':id/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark a story as seen' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  storyView(
    @CurrentUser() user: RequestUser,
    @Param() p: StoryIdParamDto,
  ): Promise<void> {
    return this.stories.view(user, p.id);
  }

  @Get(':id/viewers')
  @ApiOperation({ summary: 'Who saw my story (author only)' })
  @ApiEnvelopeResponse(StoryViewerDto, { isArray: true })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  storyViewers(
    @CurrentUser() user: RequestUser,
    @Param() p: StoryIdParamDto,
    @Query() q: StoryPageQueryDto,
  ): Promise<StoryPage<StoryViewerDto>> {
    return this.stories.viewers(user, p.id, q.cursor, q.limit);
  }
}
