import { ApiProperty } from '@nestjs/swagger';
import {
  BidStatus,
  FeeType,
  OfferStatus,
  PartyRole,
  StartAvailability,
} from '@prisma/client';

/** One round of the negotiation history (docs/04 §5.2, §6). */
export class BidOfferDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: 'integer', minimum: 0 })
  roundNo!: number;

  @ApiProperty({ enum: PartyRole, enumName: 'PartyRole' })
  fromRole!: PartyRole;

  @ApiProperty({ enum: FeeType, enumName: 'FeeType' })
  feeType!: FeeType;

  @ApiProperty({ type: 'integer' })
  amountCents!: number;

  @ApiProperty({ type: String, nullable: true })
  message!: string | null;

  @ApiProperty({ enum: OfferStatus, enumName: 'OfferStatus' })
  status!: OfferStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

/** A bid, its current negotiated terms and its full offer history
 * (docs/04 §5.1–§5.2, §6). Returned by every bid-mutating endpoint and by
 * GET /bids/:id, so a client never needs a follow-up read to see the
 * effect of its own action. */
export class BidDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  caseId!: string;

  @ApiProperty({ format: 'uuid' })
  attorneyId!: string;

  @ApiProperty({ enum: BidStatus, enumName: 'BidStatus' })
  status!: BidStatus;

  @ApiProperty({ enum: FeeType, enumName: 'FeeType' })
  feeType!: FeeType;

  @ApiProperty({ type: 'integer' })
  amountCents!: number;

  @ApiProperty()
  message!: string;

  @ApiProperty({ enum: StartAvailability, enumName: 'StartAvailability' })
  startAvailability!: StartAvailability;

  @ApiProperty({ type: String, format: 'date', nullable: true })
  startDate!: string | null;

  @ApiProperty({ type: 'integer', nullable: true })
  estimatedDurationDays!: number | null;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 5 })
  roundCount!: number;

  @ApiProperty({ enum: PartyRole, enumName: 'PartyRole' })
  turn!: PartyRole;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  decidedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: BidOfferDto, isArray: true })
  offers!: BidOfferDto[];
}
