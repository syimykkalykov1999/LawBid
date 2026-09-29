import { Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { BlockedUserDto, BlockUserParamDto } from './blocks.dto';
import { BlocksService } from './blocks.service';

/** Owner decision 2026-09-29 (OQ-028): block / unblock any user. */
@ApiTags('blocks')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('users')
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get('me/blocks')
  @ApiOperation({ summary: 'Users I blocked (OQ-028)' })
  @ApiEnvelopeResponse(BlockedUserDto, { isArray: true })
  listBlocks(@CurrentUser() user: RequestUser): Promise<BlockedUserDto[]> {
    return this.blocks.list(user.sub);
  }

  @Put(':id/block')
  @HttpCode(204)
  @ApiOperation({ summary: 'Block a user (OQ-028); idempotent' })
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND], 422: [ErrorCode.VALIDATION_ERROR] })
  block(
    @CurrentUser() user: RequestUser,
    @Param() p: BlockUserParamDto,
  ): Promise<void> {
    return this.blocks.block(user.sub, p.id);
  }

  @Delete(':id/block')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unblock a user (OQ-028); idempotent' })
  unblock(
    @CurrentUser() user: RequestUser,
    @Param() p: BlockUserParamDto,
  ): Promise<void> {
    return this.blocks.unblock(user.sub, p.id);
  }
}
