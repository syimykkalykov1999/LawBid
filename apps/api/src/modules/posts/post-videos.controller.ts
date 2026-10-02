import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AttorneyOnly } from '../auth/assistant/assistant-context';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import {
  CreateVideoUploadDto,
  VideoAssetDto,
  VideoIdParamDto,
  VideoUploadDto,
} from '../videos/videos.dto';
import { VideosService } from '../videos/videos.service';
import { PostsPageQueryDto, PostDto, type PostPage } from './dto/posts.dto';
import { PostsService } from './posts.service';

const E = ErrorCode;

/**
 * Owner 2026-10-01 — reels: direct uploads to Bunny and the full-screen
 * reels feed. Every route answers VIDEO_UNAVAILABLE until the owner turns
 * `video_posts` on and adds the Bunny keys.
 */
@ApiTags('videos')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class PostVideosController {
  constructor(
    private readonly videos: VideosService,
    private readonly posts: PostsService,
  ) {}

  // Audit 2026-10-02: assistants with "publish" post reels too.
  @AttorneyOnly('publish')
  @Post('videos/uploads')
  @ApiOperation({ summary: 'Start a direct video upload (TUS credentials)' })
  @ApiEnvelopeResponse(VideoUploadDto, { status: 201 })
  @ApiErrors({
    403: [E.VIDEO_UNAVAILABLE, E.POST_NOT_ALLOWED],
    409: [E.VIDEO_NOT_READY],
    422: [E.VIDEO_TOO_LONG],
    429: [E.RATE_LIMITED],
    503: [E.VIDEO_UNAVAILABLE],
  })
  async createVideoUpload(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateVideoUploadDto,
  ): Promise<VideoUploadDto> {
    await this.posts.assertCanPublish(user);
    return this.videos.createUpload(user.sub, dto);
  }

  @Get('videos/:id')
  @ApiOperation({ summary: 'My upload: status while Bunny encodes' })
  @ApiEnvelopeResponse(VideoAssetDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  getVideoAsset(
    @CurrentUser() user: RequestUser,
    @Param() p: VideoIdParamDto,
  ): Promise<VideoAssetDto> {
    return this.videos.getOwn(user.sub, p.id);
  }

  @AttorneyOnly('publish')
  @Delete('videos/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel an upload no post uses yet' })
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.FILE_NOT_ATTACHABLE] })
  cancelVideoUpload(
    @CurrentUser() user: RequestUser,
    @Param() p: VideoIdParamDto,
  ): Promise<void> {
    return this.videos.cancel(user.sub, p.id);
  }

  @Get('reels')
  @ApiOperation({ summary: 'Video posts, newest first (full-screen reels)' })
  @ApiEnvelopeResponse(PostDto, { isArray: true })
  @ApiErrors({ 403: [E.VIDEO_UNAVAILABLE], 503: [E.VIDEO_UNAVAILABLE] })
  async listReels(
    @CurrentUser() user: RequestUser,
    @Query() q: PostsPageQueryDto,
  ): Promise<PostPage> {
    await this.videos.assertAvailable();
    return this.posts.listReels(user, q);
  }
}
