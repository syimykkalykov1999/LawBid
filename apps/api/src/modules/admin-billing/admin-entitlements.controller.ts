import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  CUSTOM_KEY_PATTERN,
  CustomEntitlementsService,
} from '../plans/custom-entitlements.service';
import { EntitlementsService } from '../plans/entitlements.service';
import { EntitlementDefDto, LocalizedTextDto } from '../plans/plans.dto';

const E = ErrorCode;

class NewTextDto {
  @ApiProperty() @IsString() @MaxLength(120) en!: string;
  @ApiProperty() @IsString() @MaxLength(120) ru!: string;
}

export class NewEntitlementDto {
  @ApiProperty({
    description: 'a-z, 0-9, _; 3-40 characters; cannot be a built-in key',
  })
  @Matches(CUSTOM_KEY_PATTERN)
  key!: string;
  @ApiProperty({ enum: ['boolean', 'number'] })
  @IsIn(['boolean', 'number'])
  type!: 'boolean' | 'number';
  @ApiProperty({ enum: ['attorney', 'client'], isArray: true })
  @IsArray()
  @IsIn(['attorney', 'client'], { each: true })
  audiences!: ('attorney' | 'client')[];
  @ApiProperty({ enum: ['team', 'cases', 'visibility', 'features', 'billing'] })
  @IsIn(['team', 'cases', 'visibility', 'features', 'billing'])
  group!: 'team' | 'cases' | 'visibility' | 'features' | 'billing';
  @ApiProperty({ type: NewTextDto })
  @ValidateNested()
  @Type(() => NewTextDto)
  label!: NewTextDto;
  @ApiProperty({ type: NewTextDto })
  @ValidateNested()
  @Type(() => NewTextDto)
  description!: NewTextDto;
  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @IsInt()
  @Min(0)
  max?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() zeroIsUnlimited?: boolean;
}

export class NewEntitlementResultDto {
  @ApiProperty({ type: EntitlementDefDto }) entitlement!: EntitlementDefDto;
  @ApiProperty({ type: LocalizedTextDto }) _note!: LocalizedTextDto;
}

/**
 * Owner 2026-10-14: «Новая функция» — the owner adds a feature to the plan
 * builder without a release. The feature then shows in every plan editor
 * and in the app's `/me/entitlements`; code that gates something checks it
 * by key (`EntitlementsService.has`). Built-in features cannot be touched.
 */
@ApiTags('admin-billing')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/billing/entitlements')
export class AdminEntitlementsController {
  constructor(
    private readonly custom: CustomEntitlementsService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditLogService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a plan feature (stored as data)' })
  @ApiEnvelopeResponse(NewEntitlementResultDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 409: [E.PLAN_CODE_EXISTS] })
  async createEntitlement(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: NewEntitlementDto,
  ): Promise<NewEntitlementResultDto> {
    if (dto.audiences.length === 0) {
      throw new BadRequestException({
        code: E.VALIDATION_ERROR,
        message: 'Pick at least one audience.',
      });
    }
    let def;
    try {
      def = await this.custom.create({
        ...dto,
        min: 0,
      });
    } catch (e) {
      if (e instanceof Error && e.message === 'key_exists') {
        throw new ConflictException({
          code: E.PLAN_CODE_EXISTS,
          message: 'A feature with this key exists.',
        });
      }
      throw new BadRequestException({
        code: E.VALIDATION_ERROR,
        message: 'Bad feature key.',
      });
    }
    await this.entitlements.invalidateAll();
    await this.audit.record({
      adminId: admin.id,
      action: 'billing.entitlement.create',
      targetType: 'entitlement',
      targetId: null,
      after: { key: def.key, type: def.type, audiences: def.audiences },
      ip: admin.ip,
      justification: null,
    });
    return {
      entitlement: {
        key: def.key,
        type: def.type,
        audiences: def.audiences,
        group: def.group,
        label: def.label,
        description: def.description,
        min: def.min,
        max: def.max,
        zeroIsUnlimited: def.zeroIsUnlimited,
        custom: true,
      },
      _note: { en: 'Created', ru: 'Создано' },
    };
  }

  @Delete(':key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a feature created in the admin' })
  @ApiEnvelopeResponse(NewEntitlementResultDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async removeEntitlement(
    @CurrentAdmin() admin: AdminActor,
    @Param('key') key: string,
  ): Promise<{ removed: true }> {
    const done = await this.custom.remove(key);
    if (!done) {
      throw new NotFoundException({
        code: E.NOT_FOUND,
        message: 'No such custom feature.',
      });
    }
    await this.entitlements.invalidateAll();
    await this.audit.record({
      adminId: admin.id,
      action: 'billing.entitlement.remove',
      targetType: 'entitlement',
      targetId: null,
      after: { key, removed: true },
      ip: admin.ip,
      justification: null,
    });
    return { removed: true };
  }
}
