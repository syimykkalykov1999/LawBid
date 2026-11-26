import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ErrorCode as E } from '../../../common/errors/error-code.enum';
import { Public } from '../../auth/decorators/public.decorator';
import {
  InfraAuthError,
  InfraGithubClient,
  InfraUnavailableError,
  type WorkflowCaller,
} from '../infra/infra-github.client';
import {
  MEDIA_BACKUP_OIDC_AUDIENCE,
  MEDIA_BACKUP_WORKFLOW_FILE,
} from '../../../common/ops/media-backup.logic';
import { MediaBackupService } from './media-backup.service';

export class MediaBackupJobAskDto {
  /** The run was started as a dry run (by «Включить» or by hand). */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class MediaBackupReportDto {
  @IsBoolean()
  dryRun!: boolean;

  @IsBoolean()
  ok!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  objects?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bytes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  error?: string;
}

/**
 * 26.11 (owner: «вставить ключи в админке — и всё», D10):
 * `.github/workflows/media-backup.yml` talks to the API here with its GitHub
 * Actions OIDC token (audience lawbid-media-backup), checked like the infra
 * pipeline's (repository, this workflow file, refs/heads/main). The read-only
 * R2 token goes to that run only; GitHub stores nothing. CI only, so left out
 * of the OpenAPI document.
 */
@ApiExcludeController()
@Public()
@Controller('infra/workflow/media-backup')
export class MediaBackupWorkflowController {
  constructor(
    private readonly backup: MediaBackupService,
    private readonly github: InfraGithubClient,
  ) {}

  // Not `caller` (KNOWN_ERRORS 205).
  private async workflowCaller(
    auth: string | undefined,
  ): Promise<WorkflowCaller> {
    try {
      return await this.github.verifyCaller(auth, {
        file: MEDIA_BACKUP_WORKFLOW_FILE,
        audience: MEDIA_BACKUP_OIDC_AUDIENCE,
      });
    } catch (e) {
      if (e instanceof InfraAuthError) {
        throw new HttpException(
          { code: E.UNAUTHORIZED, message: 'Not the media-backup workflow.' },
          HttpStatus.UNAUTHORIZED,
        );
      }
      if (e instanceof InfraUnavailableError) {
        throw new HttpException(
          {
            code: E.INTERNAL_ERROR,
            message: 'The caller cannot be checked right now; retry.',
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw e;
    }
  }

  /** What this run does (copy / dry run / nothing) and, when it runs, the
   * read-only R2 token and the AWS role + bucket names. */
  // flag: none CI-only route (GitHub OIDC); runs only with the admin's r2_backup keys
  @Post('job')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async mediaBackupJob(
    @Headers('authorization') auth: string | undefined,
    @Body() dto: MediaBackupJobAskDto,
  ) {
    await this.workflowCaller(auth);
    return this.backup.job(dto?.dryRun === true);
  }

  /** The run's result: «Запуск» shows it. */
  // flag: none CI-only route (GitHub OIDC); runs only with the admin's r2_backup keys
  @Post('report')
  @HttpCode(HttpStatus.OK)
  async mediaBackupReport(
    @Headers('authorization') auth: string | undefined,
    @Body() dto: MediaBackupReportDto,
  ) {
    const run = await this.workflowCaller(auth);
    const s = await this.backup.report(run, {
      dryRun: dto.dryRun,
      ok: dto.ok,
      objects: dto.objects ?? null,
      bytes: dto.bytes ?? null,
      error: dto.error ?? null,
    });
    return { ok: true, lastOkRunAt: s.lastOkRunAt };
  }
}
