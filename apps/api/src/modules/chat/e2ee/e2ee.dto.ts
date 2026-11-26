import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBase64,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Item 25 (docs/architecture/E2EE_MLS_PLAN_2026-11-25.md §3): the MLS
 * Delivery Service. Every MLS object travels as the base64 of its encoded
 * MLSMessage (RFC 9420 §6), exactly as the client library produced it.
 * Size caps stay under the default 256 KB JSON body.
 */
export const MLS_KEY_PACKAGE_MAX_B64 = 8 * 1024;
export const MLS_COMMIT_MAX_B64 = 96 * 1024;
export const MLS_WELCOME_MAX_B64 = 128 * 1024;
export const MLS_MESSAGE_MAX_B64 = 128 * 1024;
export const MLS_GROUP_ID_MAX_B64 = 88; // 64 bytes

export const E2EE_PLATFORMS = ['ios', 'android', 'macos', 'web'] as const;

export class E2eeDeviceIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class RegisterMlsDeviceDto {
  @ApiProperty({
    description:
      'Base64 of the Ed25519 public key of the device’s MLS credential (32 bytes).',
  })
  @IsString()
  @IsBase64()
  @MaxLength(64)
  signatureKey!: string;

  @ApiProperty({ enum: E2EE_PLATFORMS, enumName: 'MlsDevicePlatform' })
  @IsIn(E2EE_PLATFORMS)
  platform!: (typeof E2EE_PLATFORMS)[number];
}

export class MlsDeviceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ description: 'Base64 Ed25519 public signature key.' })
  signatureKey!: string;

  @ApiProperty({ enum: E2EE_PLATFORMS, enumName: 'MlsDevicePlatform' })
  platform!: string;

  @ApiProperty({
    description: 'The MLS credential identity this device must use.',
  })
  identity!: string;

  @ApiProperty({ type: Date })
  createdAt!: Date;
}

export class UploadKeyPackagesDto {
  @ApiProperty({
    type: [String],
    description:
      'One-time KeyPackages (base64 MLSMessage, wire format mls_key_package). At most chat.e2ee_key_packages_target per call.',
  })
  @IsArray()
  @ArrayMaxSize(1000)
  @IsBase64({}, { each: true })
  @MaxLength(MLS_KEY_PACKAGE_MAX_B64, { each: true })
  keyPackages!: string[];

  @ApiPropertyOptional({
    description:
      'The last-resort KeyPackage (RFC 9420 §16.8): handed out only when no one-time package is left, never deleted by a claim. Replaces the previous one.',
  })
  @IsOptional()
  @IsBase64()
  @MaxLength(MLS_KEY_PACKAGE_MAX_B64)
  lastResort?: string;
}

export class KeyPackageCountDto {
  @ApiProperty({ description: 'One-time KeyPackages left on the server.' })
  oneTime!: number;

  @ApiProperty()
  lastResort!: boolean;

  @ApiProperty({
    description:
      'chat.e2ee_key_packages_target: the app tops up below half of it.',
  })
  target!: number;
}

export class ClaimKeyPackagesDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(1024)
  @IsUUID('all', { each: true })
  deviceIds!: string[];
}

export class ClaimedKeyPackageDto {
  @ApiProperty({ format: 'uuid' })
  deviceId!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Base64 MLSMessage; null when the device has none left.',
  })
  keyPackage!: string | null;
}

export class CreateMlsGroupDto {
  @ApiProperty({ format: 'uuid', description: 'The creating device.' })
  @IsUUID('all')
  deviceId!: string;

  @ApiProperty({ description: 'Base64 of the MLS group_id (≤ 64 bytes).' })
  @IsBase64()
  @MaxLength(MLS_GROUP_ID_MAX_B64)
  groupId!: string;
}

/** RFC 9420 §12.4.3.1: a Welcome this device could not join from (its
 * KeyPackage's private half is gone, the Welcome is damaged) — the other
 * members remove the device's leaf and add it again from a new KeyPackage,
 * so it gets a fresh Welcome (Wire's "re-add on failed Welcome"). */
export class MlsRejoinDto {
  @ApiProperty({ format: 'uuid', description: 'My device that cannot join.' })
  @IsUUID('all')
  deviceId!: string;
}

export class MlsCommitDto {
  @ApiProperty({ format: 'uuid', description: 'The committing device.' })
  @IsUUID('all')
  deviceId!: string;

  @ApiProperty({ description: 'The epoch the commit was made in.' })
  @IsInt()
  @Min(0)
  epoch!: number;

  @ApiProperty({
    description:
      'Base64 MLSMessage with the commit (PublicMessage preferred: the server checks its adds).',
  })
  @IsBase64()
  @MaxLength(MLS_COMMIT_MAX_B64)
  commit!: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(1024)
  @IsUUID('all', { each: true })
  addedDevices!: string[];

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(1024)
  @IsUUID('all', { each: true })
  removedDevices!: string[];

  @ApiPropertyOptional({
    description:
      'Base64 MLSMessage (mls_welcome) for the added devices; required when any is added.',
  })
  @IsOptional()
  @IsBase64()
  @MaxLength(MLS_WELCOME_MAX_B64)
  welcome?: string;
}

export class MlsEpochDto {
  @ApiProperty({ description: 'The group’s epoch after the commit.' })
  epoch!: number;
}

export class MlsCommitsQueryDto {
  @ApiPropertyOptional({
    description: 'Commits made in this epoch and later (default 0).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  after?: number;
}

export class MlsCommitRowDto {
  @ApiProperty()
  epoch!: number;

  @ApiProperty({ format: 'uuid' })
  senderDeviceId!: string;

  @ApiProperty({ description: 'Base64 MLSMessage.' })
  commit!: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  addedDevices!: string[];

  @ApiProperty({ type: [String], format: 'uuid' })
  removedDevices!: string[];

  @ApiProperty({ type: Date })
  createdAt!: Date;
}

export class MlsWelcomeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  conversationId!: string;

  @ApiProperty({ description: 'The epoch the device joins into.' })
  epoch!: number;

  @ApiProperty({ description: 'Base64 MLSMessage (mls_welcome).' })
  welcome!: string;
}

export class MlsWelcomesQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  deviceId!: string;
}

export class MlsGroupMemberDeviceDto {
  @ApiProperty({ format: 'uuid' })
  deviceId!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ description: 'Base64 Ed25519 public signature key.' })
  signatureKey!: string;

  @ApiProperty({ description: 'In the MLS group now.' })
  inGroup!: boolean;
}

/** M12 (owner 26.11): a recipient phone's push-preview key — the sender
 * HPKE-seals a short preview of each message to it (RFC 9180, X25519 /
 * HKDF-SHA256 / ChaCha20Poly1305), the phone opens it in the push. */
export class PushPreviewKeyDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({
    description:
      'The key’s id (base64url of the first 12 bytes of its SHA-256); a sealed preview is sent under it.',
  })
  keyId!: string;

  @ApiProperty({ description: 'Base64 X25519 public key (32 bytes).' })
  publicKey!: string;
}

export const E2EE_STATES = ['off', 'pending', 'on'] as const;
export type E2eeState = (typeof E2EE_STATES)[number];
export const E2EE_OFF_REASONS = [
  'mode_off',
  'demo',
  'locked',
  'too_many_members',
  'devices_missing',
] as const;
export type E2eeOffReason = (typeof E2EE_OFF_REASONS)[number];

export class ConversationE2eeDto {
  @ApiProperty({
    enum: E2EE_STATES,
    enumName: 'ConversationE2eeState',
    description:
      'off = write as before (server-side encryption); pending = the first device may create the MLS group now; on = the chat is end-to-end encrypted (send type=mls).',
  })
  state!: E2eeState;

  @ApiPropertyOptional({
    enum: E2EE_OFF_REASONS,
    enumName: 'ConversationE2eeOffReason',
    nullable: true,
  })
  reason!: E2eeOffReason | null;

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
    type: [MlsGroupMemberDeviceDto],
    description:
      'Active devices of the chat’s members (in the group or still to add).',
  })
  devices!: MlsGroupMemberDeviceDto[];

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'Devices still in the group that must be removed first (signed out, or their person left the chat). MLS messages are refused until a commit removes them.',
  })
  removeDevices!: string[];

  @ApiPropertyOptional({
    type: [PushPreviewKeyDto],
    description:
      'M12: the other members’ phones a sender seals the push preview of each message to (empty when message previews in pushes are off).',
  })
  previewKeys?: PushPreviewKeyDto[];
}

// ------------------------------------------------------------------ PR 4

export const E2EE_REPORT_REASONS = [
  'spam',
  'abuse',
  'harassment',
  'hate_speech',
  'fraud',
  'inappropriate',
  'personal_info',
  'other',
] as const;

export class E2eeReportedMessageDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  messageId!: string;

  @ApiProperty({
    description:
      'Base64 of the message plaintext exactly as this device decrypted it (it holds the franking key `k`).',
  })
  @IsBase64()
  @MaxLength(MLS_MESSAGE_MAX_B64)
  plaintext!: string;
}

export class E2eeReportDto {
  @ApiProperty({ format: 'uuid', description: 'The person reported.' })
  @IsUUID('all')
  reportedUserId!: string;

  @ApiProperty({ enum: E2EE_REPORT_REASONS, enumName: 'E2eeReportReason' })
  @IsIn(E2EE_REPORT_REASONS)
  reason!: (typeof E2EE_REPORT_REASONS)[number];

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiProperty({
    type: [E2eeReportedMessageDto],
    description:
      "The reported person's last messages (at most chat.e2ee_report_messages), as WhatsApp sends them.",
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => E2eeReportedMessageDto)
  messages!: E2eeReportedMessageDto[];
}

export class E2eeReportResultDto {
  @ApiProperty({ format: 'uuid' })
  reportId!: string;

  @ApiProperty({ description: 'Messages whose franking tag matched.' })
  verified!: number;

  @ApiProperty({ description: 'Messages handed over in all.' })
  total!: number;
}

export class E2eeBackupPutDto {
  @ApiProperty({
    format: 'uuid',
    description: 'A clean chat_backup_e2ee file of mine.',
  })
  @IsUUID('all')
  fileId!: string;

  @ApiProperty({
    description:
      'Which 64-digit key locks it: base64 of HMAC-SHA256(backup key, "lawbid-e2ee-backup-key-id"), 16 bytes (the key itself never leaves the phone). WhatsApp: the same key serves every backup until the person makes a new one.',
    maxLength: 24,
  })
  @IsBase64()
  @MaxLength(24)
  keyId!: string;
}

export class E2eeBackupDto {
  @ApiProperty({ format: 'uuid' })
  fileId!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Which key locks the backup (E2eeBackupPutDto.keyId).',
  })
  keyId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  url!: string | null;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty({ type: Date })
  updatedAt!: Date;
}
