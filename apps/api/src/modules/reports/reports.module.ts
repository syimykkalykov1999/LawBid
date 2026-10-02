import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  Module,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { ReportReason, ReportTargetType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type Redis from 'ioredis';
import {
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { ModerationService } from '../moderation/moderation.service';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';

/** docs/05 §12.1 targets reported from file 05 screens. */
const REPORTABLE: ReportTargetType[] = [
  'post',
  'comment',
  'case_comment',
  'message',
  'user',
  'sticker_pack',
];

export class CreateReportDto {
  @ApiProperty({ enum: REPORTABLE, enumName: 'ReportTargetType' })
  @IsEnum(ReportTargetType)
  targetType!: ReportTargetType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  targetId!: string;

  @ApiProperty({ enum: ReportReason, enumName: 'ReportReason' })
  @IsEnum(ReportReason)
  reason!: ReportReason;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/**
 * docs/05 §4, §5.1, §8.4, §12.1: `POST /reports`. A repeat by the same user
 * on the same object is ignored (no unique index — §14 allows no other
 * schema change — so a Redis claim closes the race, then the DB check).
 * Handling of reports is docs/06.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: UsageLimitsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly moderation: ModerationService,
  ) {}

  async create(userId: string, dto: CreateReportDto): Promise<void> {
    if (!REPORTABLE.includes(dto.targetType)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'This object cannot be reported here.',
        details: { field: 'targetType' },
      });
    }
    await this.limits.consume('report', userId);
    const claim = `report:${userId}:${dto.targetType}:${dto.targetId}`;
    if ((await this.redis.set(claim, '1', 'EX', 30 * 24 * 3600, 'NX')) !== 'OK')
      return;
    const existing = await this.prisma.report.findFirst({
      where: {
        reporter_id: userId,
        target_type: dto.targetType,
        target_id: dto.targetId,
      },
      select: { id: true },
    });
    if (existing) return;
    await this.prisma.report.create({
      data: {
        reporter_id: userId,
        target_type: dto.targetType,
        target_id: dto.targetId,
        reason: dto.reason,
        note: dto.note ?? null,
      },
    });
    // docs/06 §3.3: the third distinct reporter hides the object.
    await this.moderation.autoHideIfThreshold(dto.targetType, dto.targetId);
  }
}

@ApiTags('reports')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Report a post, comment, message or user (docs/05 §12.1)',
  })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    429: [ErrorCode.RATE_LIMITED],
  })
  createReport(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateReportDto,
  ): Promise<void> {
    return this.reports.create(user.sub, dto);
  }
}

@Module({
  imports: [UsageLimitsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
