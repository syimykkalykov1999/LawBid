import { ApiProperty } from '@nestjs/swagger';
import { PNL_KINDS } from '../../common/pnl/pnl.rules';

export class PnlPeriodDto {
  @ApiProperty() revenueUsd!: number;
  @ApiProperty() vendorCostUsd!: number;
  @ApiProperty() fixedCostUsd!: number;
  @ApiProperty() costUsd!: number;
  @ApiProperty() profitUsd!: number;
  @ApiProperty({ type: Number, nullable: true }) marginPercent!: number | null;
}

export class PnlWeekDto {
  @ApiProperty() weekStart!: string;
  @ApiProperty() revenueUsd!: number;
  @ApiProperty() costUsd!: number;
  @ApiProperty() profitUsd!: number;
  @ApiProperty({ type: Number, nullable: true }) marginPercent!: number | null;
}

export class PnlDayDto {
  @ApiProperty() day!: string;
  @ApiProperty() revenueUsd!: number;
  @ApiProperty() costUsd!: number;
  @ApiProperty() profitUsd!: number;
}

export class PnlKindLineDto {
  @ApiProperty({ enum: PNL_KINDS }) kind!: string;
  @ApiProperty() revenueUsd!: number;
}

export class PnlReportDto {
  @ApiProperty({
    description: 'Stored snapshot time; null before the first count.',
  })
  computedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) asOf!: string | null;
  @ApiProperty({ type: PnlPeriodDto, nullable: true })
  today!: PnlPeriodDto | null;
  @ApiProperty({ type: PnlPeriodDto, nullable: true })
  week!: PnlPeriodDto | null;
  @ApiProperty({ type: PnlPeriodDto, nullable: true })
  month!: PnlPeriodDto | null;
  @ApiProperty({ type: [PnlWeekDto] }) weeks!: PnlWeekDto[];
  @ApiProperty({ type: [PnlDayDto] }) days!: PnlDayDto[];
  @ApiProperty({ type: [PnlKindLineDto] }) byKind!: PnlKindLineDto[];
  @ApiProperty({ type: String, nullable: true }) vendorDataFrom!: string | null;
}
