import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AdminEndpoint } from '../admin-auth/admin-auth.decorators';
import { Public } from '../auth/decorators/public.decorator';
import {
  CrashBatchDto,
  CrashDaysQueryDto,
  CrashDetailDto,
  CrashFingerprintParamDto,
  CrashGroupDto,
} from './crash-reports.dto';
import { CrashReportsService } from './crash-reports.service';

/** Owner 2026-10-15: the phone sends its errors here (a crash can happen
 * before sign-in, so no token; small batches, rate limited). */
@ApiTags('crash-reports')
@Controller('crash-reports')
export class CrashReportsController {
  constructor(private readonly crashes: CrashReportsService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @ApiOperation({ summary: 'The app reports errors (batch of up to 10)' })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    429: [ErrorCode.RATE_LIMITED],
  })
  async reportCrashes(
    @Body() dto: CrashBatchDto,
    @Headers('x-device-key') deviceKey?: string,
  ): Promise<void> {
    await this.crashes.ingest(dto.reports, deviceKey ?? null);
  }
}

/** Admin → Система → Вылеты: which errors, how many, on what phones. */
@ApiTags('admin-crashes')
@AdminEndpoint('super_admin', 'moderator')
@Controller('admin/crashes')
export class AdminCrashesController {
  constructor(private readonly crashes: CrashReportsService) {}

  @Get()
  @ApiOperation({ summary: 'Crashes grouped, most frequent first' })
  @ApiEnvelopeResponse(CrashGroupDto, { isArray: true })
  listCrashGroups(@Query() q: CrashDaysQueryDto): Promise<CrashGroupDto[]> {
    return this.crashes.groups(q.days ?? 7);
  }

  @Get(':fingerprint')
  @ApiOperation({ summary: 'One crash: stack, versions, systems, phones' })
  @ApiEnvelopeResponse(CrashDetailDto)
  getCrashDetail(
    @Param() p: CrashFingerprintParamDto,
  ): Promise<CrashDetailDto> {
    return this.crashes.detail(p.fingerprint);
  }

  @Delete(':fingerprint')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark fixed: clears the group' })
  resolveCrash(@Param() p: CrashFingerprintParamDto): Promise<void> {
    return this.crashes.resolve(p.fingerprint);
  }
}
