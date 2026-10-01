import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  NotFoundException,
  Param,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { FeeType, type Prisma, StartAvailability } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { RequiresDuty } from '../auth/assistant/assistant-context';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import {
  BID_AMOUNT_MAX_CENTS,
  BID_MESSAGE_MAX,
  ESTIMATED_DURATION_MAX_DAYS,
} from '../bids/dto/bid-requests.dto';
import { CaseIdParamDto } from '../cases/dto/cases-feed.dto';

/** The bid form, every field optional (a draft may be half done). */
export class BidDraftBodyDto {
  @ApiPropertyOptional({ enum: FeeType, enumName: 'FeeType' })
  @IsOptional()
  @IsEnum(FeeType)
  feeType?: FeeType;

  @ApiPropertyOptional({ type: 'integer', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(BID_AMOUNT_MAX_CENTS)
  amountCents?: number;

  @ApiPropertyOptional({ maxLength: BID_MESSAGE_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(BID_MESSAGE_MAX)
  message?: string;

  @ApiPropertyOptional({
    enum: StartAvailability,
    enumName: 'StartAvailability',
  })
  @IsOptional()
  @IsEnum(StartAvailability)
  startAvailability?: StartAvailability;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(ESTIMATED_DURATION_MAX_DAYS)
  estimatedDurationDays?: number;
}

export class BidDraftDto extends BidDraftBodyDto {
  @ApiProperty({ format: 'uuid' }) caseId!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  preparedBy!: string | null;
  @ApiProperty() updatedAt!: string;
}

@Injectable()
export class BidDraftsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: RequestUser, caseId: string): Promise<BidDraftDto> {
    const d = await this.prisma.bidDraft.findUnique({
      where: {
        attorney_id_case_id: { attorney_id: user.sub, case_id: caseId },
      },
    });
    if (!d) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'No draft for this case.',
      });
    }
    return {
      ...(d.payload as BidDraftBodyDto),
      caseId,
      preparedBy: d.prepared_by_name,
      updatedAt: d.updated_at.toISOString(),
    };
  }

  async put(
    user: RequestUser,
    caseId: string,
    dto: BidDraftBodyDto,
  ): Promise<BidDraftDto> {
    const kase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true },
    });
    if (!kase) {
      throw new NotFoundException({
        code: ErrorCode.CASE_NOT_FOUND,
        message: 'Case not found.',
      });
    }
    const payload = { ...dto } as Prisma.InputJsonObject;
    const by = user.assistant?.name.slice(0, 80) ?? null;
    await this.prisma.bidDraft.upsert({
      where: {
        attorney_id_case_id: { attorney_id: user.sub, case_id: caseId },
      },
      create: {
        attorney_id: user.sub,
        case_id: caseId,
        payload,
        prepared_by_name: by,
      },
      update: { payload, prepared_by_name: by },
    });
    return this.get(user, caseId);
  }

  async remove(user: RequestUser, caseId: string): Promise<void> {
    await this.prisma.bidDraft.deleteMany({
      where: { attorney_id: user.sub, case_id: caseId },
    });
  }
}

/** Owner 2026-09-30 (OQ-048): assistants prepare bids, attorneys send. */
@ApiTags('bids')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@RequiresDuty('bid_drafts')
@Controller('cases/:id/bid-draft')
export class BidDraftsController {
  constructor(private readonly drafts: BidDraftsService) {}

  @Get()
  @ApiOperation({ summary: 'The bid draft prepared for this case' })
  @ApiEnvelopeResponse(BidDraftDto)
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  getBidDraft(
    @CurrentUser() user: RequestUser,
    @Param() p: CaseIdParamDto,
  ): Promise<BidDraftDto> {
    return this.drafts.get(user, p.id);
  }

  @Put()
  @ApiOperation({
    summary: 'Save a bid draft (the attorney reviews and sends)',
  })
  @ApiEnvelopeResponse(BidDraftDto)
  @ApiErrors({ 404: [ErrorCode.CASE_NOT_FOUND] })
  saveBidDraft(
    @CurrentUser() user: RequestUser,
    @Param() p: CaseIdParamDto,
    @Body() dto: BidDraftBodyDto,
  ): Promise<BidDraftDto> {
    return this.drafts.put(user, p.id, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Discard the bid draft' })
  deleteBidDraft(
    @CurrentUser() user: RequestUser,
    @Param() p: CaseIdParamDto,
  ): Promise<void> {
    return this.drafts.remove(user, p.id);
  }
}
