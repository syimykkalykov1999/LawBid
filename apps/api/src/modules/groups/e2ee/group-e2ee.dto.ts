import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBase64,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import {
  E2EE_STATES,
  MLS_COMMIT_MAX_B64,
  MLS_GROUP_ID_MAX_B64,
  MlsCommitDto,
  MlsGroupMemberDeviceDto,
  type E2eeState,
} from '../../chat/chat-e2ee.public';

/**
 * Group E2EE G1 (docs/architecture/GROUP_E2EE_DESIGN_2026-11-26.md §4):
 * the group chats' side of the MLS Delivery Service. MLS objects travel as
 * base64 of the encoded MLSMessage, as in the chats.
 *
 * A GroupInfo with the ratchet tree grows with the group (≈ 200–300 bytes a
 * leaf, design §3): the commit routes of groups parse a bigger body
 * (GROUP_E2EE_BODY_LIMIT in app.setup.ts); beyond `groups.e2ee_group_info_inline_kb` the
 * phone uploads it as a `chat_e2ee` file and sends only its id.
 */
export const MLS_GROUP_INFO_MAX_B64 = (5 * 1024 * 1024) / 2;

export const GROUP_E2EE_OFF_REASONS = [
  'mode_off',
  'demo',
  'public_group',
  'too_many_members',
  'devices_missing',
] as const;
export type GroupE2eeOffReason = (typeof GROUP_E2EE_OFF_REASONS)[number];

/** The latest GroupInfo goes with every commit (Wire's commit bundle). */
class GroupInfoCarrier {
  @ApiPropertyOptional({
    maxLength: MLS_GROUP_INFO_MAX_B64,
    description:
      'Base64 MLSMessage (mls_group_info) of the epoch after this commit, with the ratchet_tree extension. Inline up to groups.e2ee_group_info_inline_kb KiB; otherwise groupInfoFileId.',
  })
  @IsOptional()
  @IsBase64()
  @MaxLength(MLS_GROUP_INFO_MAX_B64)
  groupInfo?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'A bigger GroupInfo: my uploaded chat_e2ee file holding it (direct upload, the server keeps only the id).',
  })
  @IsOptional()
  @IsUUID('all')
  groupInfoFileId?: string;
}

export class CreateGroupMlsDto extends GroupInfoCarrier {
  @ApiProperty({ format: 'uuid', description: 'The creating device.' })
  @IsUUID('all')
  deviceId!: string;

  @ApiProperty({
    description:
      'Base64 of the MLS group_id: the UTF-8 bytes of "lawbid:g:<groupId>".',
  })
  @IsBase64()
  @MaxLength(MLS_GROUP_ID_MAX_B64)
  groupId!: string;
}

export class GroupMlsCommitDto extends MlsCommitDto {
  @ApiPropertyOptional({
    maxLength: MLS_GROUP_INFO_MAX_B64,
    description:
      'Base64 MLSMessage (mls_group_info) of the epoch after this commit, with the ratchet_tree extension. Required unless groupInfoFileId.',
  })
  @IsOptional()
  @IsBase64()
  @MaxLength(MLS_GROUP_INFO_MAX_B64)
  groupInfo?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'A bigger GroupInfo as my uploaded chat_e2ee file.',
  })
  @IsOptional()
  @IsUUID('all')
  groupInfoFileId?: string;
}

export class GroupExternalCommitDto extends GroupInfoCarrier {
  @ApiProperty({ format: 'uuid', description: 'My joining device.' })
  @IsUUID('all')
  deviceId!: string;

  @ApiProperty({ description: 'The epoch of the GroupInfo it joined from.' })
  @IsInt()
  @Min(0)
  epoch!: number;

  @ApiProperty({
    description:
      'Base64 MLSMessage: the external commit (PublicMessage from a new_member_commit sender, RFC 9420 §12.4.3.2).',
  })
  @IsBase64()
  @MaxLength(MLS_COMMIT_MAX_B64)
  commit!: string;

  @ApiPropertyOptional({
    description:
      'Resync: my device is in the group but lost its state; the commit removes its own old leaf (one Remove).',
  })
  @IsOptional()
  @IsBoolean()
  resync?: boolean;
}

export class GroupClaimKeyPackagesDto {
  @ApiProperty({
    format: 'uuid',
    description: 'My device that holds the right to commit (POST …/lease).',
  })
  @IsUUID('all')
  deviceId!: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(1024)
  @IsUUID('all', { each: true })
  deviceIds!: string[];
}

export class GroupMlsLeaseDto {
  @ApiProperty({ format: 'uuid', description: 'My device asking.' })
  @IsUUID('all')
  deviceId!: string;
}

export class GroupMlsLeaseResultDto {
  @ApiProperty({ description: 'My device holds the right to commit now.' })
  granted!: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Who holds it (me when granted).',
  })
  holderDeviceId!: string | null;

  @ApiProperty({ description: 'Milliseconds the right lasts from now.' })
  ttlMs!: number;
}

export class GroupMlsDeviceDto extends MlsGroupMemberDeviceDto {
  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description:
      'Its last accepted commit in this group (the self-update every groups.e2ee_update_days counts from it).',
  })
  lastCommitAt!: Date | null;
}

export class GroupE2eeDto {
  @ApiProperty({
    enum: E2EE_STATES,
    enumName: 'GroupE2eeState',
    description:
      'off = write as before; pending = the first device may create the MLS group now; on = end-to-end encrypted (send type=mls).',
  })
  state!: E2eeState;

  @ApiPropertyOptional({
    enum: GROUP_E2EE_OFF_REASONS,
    enumName: 'GroupE2eeOffReason',
    nullable: true,
  })
  reason!: GroupE2eeOffReason | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Base64 MLS group_id.',
  })
  groupId!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  epoch!: number | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  since!: Date | null;

  @ApiProperty({
    type: [GroupMlsDeviceDto],
    description:
      'Active devices of the live members (in the MLS group or still to add / to join).',
  })
  devices!: GroupMlsDeviceDto[];

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'Devices still in the MLS group that must be removed first (their person left / was removed, or the device was signed out). MLS messages are refused until a commit removes them.',
  })
  removeDevices!: string[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'The device holding the right to commit now, if any.',
  })
  leaseHolderDeviceId!: string | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'The epoch of the stored GroupInfo (external joins).',
  })
  groupInfoEpoch!: number | null;

  @ApiProperty({ description: 'groups.e2ee_update_days (0 = never).' })
  updateDays!: number;

  @ApiProperty({ description: 'groups.e2ee_history_max.' })
  historyMax!: number;

  @ApiProperty({
    description: 'The group lets members send history to people they add.',
  })
  historySharing!: boolean;
}

export class GroupInfoResultDto {
  @ApiProperty({ description: 'The epoch it describes.' })
  epoch!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Base64 MLSMessage (mls_group_info), when kept inline.',
  })
  groupInfo!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'A short link to the file holding it, when bigger.',
  })
  url!: string | null;
}

export class GroupMlsWelcomeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  groupId!: string;

  @ApiProperty({ description: 'The epoch the device joins into.' })
  epoch!: number;

  @ApiProperty({ description: 'Base64 MLSMessage (mls_welcome).' })
  welcome!: string;
}
