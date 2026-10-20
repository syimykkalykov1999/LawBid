import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ChatAttachmentDto } from '../chat/chat.dto';

/** Owner 2026-10-20: group chats (Telegram + WhatsApp) — limits. */
export const GROUP_TITLE_MAX = 80;
export const GROUP_DESCRIPTION_MAX = 500;
export const GROUP_MAX_MEMBERS = 512;
export const GROUP_MESSAGE_MAX_CHARS = 4000;
export const POLL_QUESTION_MAX = 300;
export const POLL_OPTION_MAX = 100;
export const POLL_OPTIONS_MIN = 2;
export const POLL_OPTIONS_MAX = 10;

export const GROUP_WHO = ['admins', 'all'] as const;
export type GroupWhoName = (typeof GROUP_WHO)[number];
/** public: @username + search; closed: invite link (optionally approved);
 * private: added by people only. */
export const GROUP_TYPES = ['public', 'closed', 'private'] as const;
export type GroupTypeName = (typeof GROUP_TYPES)[number];
// Owner 2026-10-20 (Telegram): 5–32, a–z 0–9 _, a letter first, no «__»,
// no «_» last.
export const GROUP_USERNAME_RE =
  /^(?=.{5,32}$)[A-Za-z](?:[A-Za-z0-9]|_(?!_|$))*$/;
export const TOPIC_TITLE_MAX = 64;
export const TOPIC_COLORS = 7;
export const GROUP_ROLES = ['owner', 'admin', 'member'] as const;
export type GroupRoleName = (typeof GROUP_ROLES)[number];

/** Telegram's admin checkboxes. The owner has all of them. */
export const GROUP_ADMIN_RIGHTS = [
  'info',
  'delete',
  'ban',
  'invite',
  'pin',
  'calls',
  'admins',
] as const;
export type GroupAdminRight = (typeof GROUP_ADMIN_RIGHTS)[number];
/** What a new admin gets unless the owner ticks otherwise. */
export const DEFAULT_ADMIN_RIGHTS: GroupAdminRight[] = [
  'info',
  'delete',
  'ban',
  'invite',
  'pin',
  'calls',
];

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class GroupIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class GroupMemberParamDto extends GroupIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  userId!: string;
}

export class GroupMessageParamDto extends GroupIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  messageId!: string;
}

export class GroupPollParamDto extends GroupIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  pollId!: string;
}

export class GroupInviteCodeParamDto {
  @ApiProperty({ description: 'The code from the invite link.' })
  @IsString()
  @MinLength(6)
  @MaxLength(24)
  code!: string;
}

export class CreateGroupDto {
  @ApiProperty({ maxLength: GROUP_TITLE_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(GROUP_TITLE_MAX)
  title!: string;

  @ApiPropertyOptional({ maxLength: GROUP_DESCRIPTION_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(GROUP_DESCRIPTION_MAX)
  description?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'A clean `avatar` file of the creator.',
  })
  @IsOptional()
  @IsUUID('all')
  avatarFileId?: string;

  @ApiPropertyOptional({
    enum: GROUP_TYPES,
    enumName: 'GroupType',
    default: 'private',
    description:
      'public: @username, search, anyone joins. closed: join by the invite link. private: people are added.',
  })
  @IsOptional()
  @IsIn(GROUP_TYPES)
  type?: GroupTypeName;

  @ApiPropertyOptional({ description: 'Required for a public group.' })
  @IsOptional()
  @Matches(GROUP_USERNAME_RE)
  username?: string;

  @ApiPropertyOptional({
    description: 'closed groups: new members wait for an admin.',
  })
  @IsOptional()
  @IsBoolean()
  joinApproval?: boolean;

  @ApiProperty({
    type: [String],
    description:
      'People to add (the creator is added automatically); may be empty for public / closed groups.',
  })
  @IsArray()
  @ArrayMaxSize(GROUP_MAX_MEMBERS - 1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  memberIds!: string[];
}

export class UpdateGroupDto {
  @ApiPropertyOptional({ maxLength: GROUP_TITLE_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(GROUP_TITLE_MAX)
  title?: string;

  @ApiPropertyOptional({
    maxLength: GROUP_DESCRIPTION_MAX,
    description: 'Empty string clears it.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(GROUP_DESCRIPTION_MAX)
  description?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'A new clean `avatar` file; null removes the photo.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID('all')
  avatarFileId?: string | null;

  @ApiPropertyOptional({ enum: GROUP_WHO, description: 'Admins only.' })
  @IsOptional()
  @IsIn(GROUP_WHO)
  whoCanPost?: GroupWhoName;

  @ApiPropertyOptional({ enum: GROUP_WHO, description: 'Admins only.' })
  @IsOptional()
  @IsIn(GROUP_WHO)
  whoCanAdd?: GroupWhoName;

  @ApiPropertyOptional({ enum: GROUP_WHO, description: 'Admins only.' })
  @IsOptional()
  @IsIn(GROUP_WHO)
  whoCanEditInfo?: GroupWhoName;

  @ApiPropertyOptional({ enum: GROUP_WHO, description: 'Admins only.' })
  @IsOptional()
  @IsIn(GROUP_WHO)
  whoCanCall?: GroupWhoName;

  @ApiPropertyOptional({ enum: GROUP_WHO, description: 'Admins only.' })
  @IsOptional()
  @IsIn(GROUP_WHO)
  whoCanMedia?: GroupWhoName;

  @ApiPropertyOptional({ enum: GROUP_WHO, description: 'Admins only.' })
  @IsOptional()
  @IsIn(GROUP_WHO)
  whoCanPoll?: GroupWhoName;

  @ApiPropertyOptional({ enum: GROUP_WHO, description: 'Admins only.' })
  @IsOptional()
  @IsIn(GROUP_WHO)
  whoCanPin?: GroupWhoName;

  @ApiPropertyOptional({
    description:
      'Admins only: show service lines (created, joined, left, renamed…) to everyone.',
  })
  @IsOptional()
  @IsBoolean()
  showServiceMessages?: boolean;

  @ApiPropertyOptional({ description: 'Admins only: the join link on/off.' })
  @IsOptional()
  @IsBoolean()
  inviteEnabled?: boolean;

  @ApiPropertyOptional({
    enum: GROUP_TYPES,
    enumName: 'GroupType',
    description: 'Admins only: public / closed / private.',
  })
  @IsOptional()
  @IsIn(GROUP_TYPES)
  type?: GroupTypeName;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Admins only: the @username of a public group.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(GROUP_USERNAME_RE)
  username?: string | null;

  @ApiPropertyOptional({ description: 'Admins only (closed groups).' })
  @IsOptional()
  @IsBoolean()
  joinApproval?: boolean;

  @ApiPropertyOptional({ description: 'Admins only: forum mode (topics).' })
  @IsOptional()
  @IsBoolean()
  topicsEnabled?: boolean;
}

export class AddGroupMembersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  userIds!: string[];
}

export class SetGroupRoleDto {
  @ApiProperty({ enum: ['admin', 'member'] })
  @IsIn(['admin', 'member'])
  role!: 'admin' | 'member';

  @ApiPropertyOptional({
    enum: GROUP_ADMIN_RIGHTS,
    isArray: true,
    description: 'Admin checkboxes (role admin); default = the usual six.',
  })
  @IsOptional()
  @IsArray()
  @IsIn(GROUP_ADMIN_RIGHTS, { each: true })
  rights?: GroupAdminRight[];
}

export class TransferGroupDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  userId!: string;
}

export class GroupMessagesQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Forum groups: only this topic («General» includes old chat).',
  })
  @IsOptional()
  @IsUUID('all')
  topicId?: string;

  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class GroupsQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description:
      'Owner 2026-10-20: true = only my archived groups; otherwise archived ones are left out.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsBoolean()
  archived?: boolean;
}

export class SendGroupMessageDto {
  @ApiProperty({ description: 'Client-generated idempotency key.' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  clientMessageId!: string;

  @ApiProperty({ enum: ['text', 'attachment'] })
  @IsIn(['text', 'attachment'])
  type!: 'text' | 'attachment';

  @ApiPropertyOptional({
    maxLength: GROUP_MESSAGE_MAX_CHARS,
    description: 'The text, or the caption of an attachment.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(GROUP_MESSAGE_MAX_CHARS)
  body?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Forum groups: the topic to write in (default «General»).',
  })
  @IsOptional()
  @IsUUID('all')
  topicId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'A quoted message.' })
  @IsOptional()
  @IsUUID('all')
  replyToId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: '@mentioned members (the app puts @username in the text).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  mentionIds?: string[];

  @ApiPropertyOptional({ format: 'uuid', description: 'type=attachment.' })
  @IsOptional()
  @IsUUID('all')
  fileId?: string;

  @ApiPropertyOptional({ maxLength: 200, description: 'type=attachment.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fileName?: string;
}

export class EditGroupMessageDto {
  @ApiProperty({ maxLength: GROUP_MESSAGE_MAX_CHARS })
  @IsString()
  @MinLength(1)
  @MaxLength(GROUP_MESSAGE_MAX_CHARS)
  body!: string;
}

export class PinGroupMessageDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'The message to pin; null unpins.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsUUID('all')
  messageId!: string | null;
}

export class ReadGroupDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  lastReadMessageId!: string;
}

export class UpdateGroupMeDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'date-time',
    description: 'Mute until; null unmutes.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601()
  mutedUntil?: string | null;

  @ApiPropertyOptional({ description: 'Pin the chat to the top of my list.' })
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional({ description: 'Hide the chat from my list.' })
  @IsOptional()
  @IsBoolean()
  hidden?: boolean;

  @ApiPropertyOptional({ description: 'Move the chat to my Archive or back.' })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class CreatePollDto {
  @ApiProperty({ description: 'Client-generated idempotency key.' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  clientMessageId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Forum groups: topic.' })
  @IsOptional()
  @IsUUID('all')
  topicId?: string;

  @ApiProperty({ maxLength: POLL_QUESTION_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(POLL_QUESTION_MAX)
  question!: string;

  @ApiProperty({
    type: [String],
    minItems: POLL_OPTIONS_MIN,
    maxItems: POLL_OPTIONS_MAX,
  })
  @IsArray()
  @ArrayMinSize(POLL_OPTIONS_MIN)
  @ArrayMaxSize(POLL_OPTIONS_MAX)
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? (value as unknown[]).map((v) => (typeof v === 'string' ? v.trim() : v))
      : value,
  )
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(POLL_OPTION_MAX, { each: true })
  options!: string[];

  @ApiProperty({ description: 'true = several answers allowed.' })
  @IsBoolean()
  multiple!: boolean;

  @ApiProperty({ description: 'true = nobody sees who voted.' })
  @IsBoolean()
  anonymous!: boolean;
}

export class VotePollDto {
  @ApiProperty({
    type: [String],
    description:
      'The chosen options (one unless the poll is multiple); an empty list retracts the vote.',
  })
  @IsArray()
  @ArrayMaxSize(POLL_OPTIONS_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  optionIds!: string[];
}

// ---------------------------------------------------------------- responses

export class GroupPersonDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  displayName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  username!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ enum: ['attorney', 'client'] })
  kind!: 'attorney' | 'client';

  @ApiProperty()
  verifiedBadge!: boolean;
}

export class GroupMemberDto extends GroupPersonDto {
  @ApiProperty({ enum: GROUP_ROLES, enumName: 'GroupRole' })
  role!: GroupRoleName;

  @ApiProperty({
    enum: GROUP_ADMIN_RIGHTS,
    isArray: true,
    description: "An admin's checkboxes (owner: all, member: none).",
  })
  rights!: GroupAdminRight[];

  @ApiProperty()
  joinedAt!: Date;
}

export class PollOptionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  text!: string;

  @ApiProperty({ description: 'People who chose this option.' })
  votes!: number;

  @ApiProperty({
    description:
      'votes / voters, 0–100 (rounded; several answers can sum >100).',
  })
  percent!: number;

  @ApiProperty({ description: 'I chose this option.' })
  voted!: boolean;

  @ApiProperty({
    type: [GroupPersonDto],
    description: 'A few recent voters — open polls only, empty when anonymous.',
  })
  recentVoters!: GroupPersonDto[];
}

export class PollDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  question!: string;

  @ApiProperty()
  multiple!: boolean;

  @ApiProperty()
  anonymous!: boolean;

  @ApiProperty()
  closed!: boolean;

  @ApiPropertyOptional({ type: Date, nullable: true })
  closedAt!: Date | null;

  @ApiProperty({ format: 'uuid' })
  creatorId!: string;

  @ApiProperty({ description: 'Distinct people who voted.' })
  totalVoters!: number;

  @ApiProperty({ type: [PollOptionDto] })
  options!: PollOptionDto[];

  @ApiProperty({ type: [String], description: 'The options I chose.' })
  myOptionIds!: string[];
}

export class PollVoterOptionDto {
  @ApiProperty({ format: 'uuid' })
  optionId!: string;

  @ApiProperty({ type: [GroupPersonDto] })
  voters!: GroupPersonDto[];
}

export class GroupReplyPreviewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  senderName!: string | null;

  @ApiProperty({ enum: ['text', 'system', 'poll', 'attachment'] })
  type!: string;

  @ApiProperty({
    description: 'A short quote of the text / caption / question.',
  })
  snippet!: string;

  @ApiProperty()
  deleted!: boolean;
}

export class GroupMessageDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  groupId!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Forum groups: the topic; null = «General».',
  })
  topicId!: string | null;

  @ApiProperty({ enum: ['text', 'system', 'poll', 'attachment'] })
  type!: 'text' | 'system' | 'poll' | 'attachment';

  @ApiPropertyOptional({ type: GroupPersonDto, nullable: true })
  sender!: GroupPersonDto | null;

  @ApiProperty({ description: 'Empty for system / poll / deleted messages.' })
  body!: string;

  @ApiProperty()
  mine!: boolean;

  @ApiProperty()
  clientMessageId!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'System messages: created | added | removed | left | joined | renamed | photo | description | promoted | demoted | pinned | poll_closed.',
  })
  systemKind!: string | null;

  @ApiPropertyOptional({
    type: [GroupPersonDto],
    description: 'System messages: who acted (first) and who it concerned.',
  })
  systemPeople!: GroupPersonDto[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'System messages: the new title (renamed / created).',
  })
  systemText!: string | null;

  @ApiPropertyOptional({ type: GroupReplyPreviewDto, nullable: true })
  replyTo!: GroupReplyPreviewDto | null;

  @ApiProperty({ type: [GroupPersonDto] })
  mentions!: GroupPersonDto[];

  @ApiProperty({ description: 'I am @mentioned.' })
  mentionsMe!: boolean;

  @ApiPropertyOptional({ type: ChatAttachmentDto, nullable: true })
  attachment!: ChatAttachmentDto | null;

  @ApiPropertyOptional({ type: PollDto, nullable: true })
  poll!: PollDto | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  editedAt!: Date | null;

  @ApiProperty({ description: 'Deleted for everyone.' })
  deleted!: boolean;

  @ApiProperty()
  createdAt!: Date;
}

export class GroupDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarFullUrl!: string | null;

  @ApiProperty()
  memberCount!: number;

  @ApiProperty({ enum: GROUP_TYPES, enumName: 'GroupType' })
  type!: GroupTypeName;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Public groups: the @username (without @).',
  })
  username!: string | null;

  @ApiProperty({ description: 'closed groups: new members need an admin.' })
  joinApproval!: boolean;

  @ApiProperty({ description: 'Forum mode: the group has topics.' })
  topicsEnabled!: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  generalTopicId!: string | null;

  @ApiProperty({ description: 'Admins: people waiting to be let in.' })
  pendingRequests!: number;

  @ApiPropertyOptional({
    enum: GROUP_ROLES,
    enumName: 'GroupRole',
    nullable: true,
    description: 'null = I am not (or no longer) a member.',
  })
  myRole!: GroupRoleName | null;

  @ApiProperty({ enum: GROUP_WHO, enumName: 'GroupWho' })
  whoCanPost!: GroupWhoName;

  @ApiProperty({ enum: GROUP_WHO, enumName: 'GroupWho' })
  whoCanAdd!: GroupWhoName;

  @ApiProperty({ enum: GROUP_WHO, enumName: 'GroupWho' })
  whoCanEditInfo!: GroupWhoName;

  @ApiProperty({ enum: GROUP_WHO, enumName: 'GroupWho' })
  whoCanCall!: GroupWhoName;

  @ApiProperty({ enum: GROUP_WHO, enumName: 'GroupWho' })
  whoCanMedia!: GroupWhoName;

  @ApiProperty({ enum: GROUP_WHO, enumName: 'GroupWho' })
  whoCanPoll!: GroupWhoName;

  @ApiProperty({ enum: GROUP_WHO, enumName: 'GroupWho' })
  whoCanPin!: GroupWhoName;

  @ApiProperty({
    enum: GROUP_ADMIN_RIGHTS,
    isArray: true,
    description: 'What I may do as owner / admin (empty for a member).',
  })
  myRights!: GroupAdminRight[];

  @ApiProperty({
    description:
      'Service lines (joined, left, renamed…) are shown to everyone.',
  })
  showServiceMessages!: boolean;

  @ApiProperty({ description: 'What I may do here (derived from the above).' })
  canPost!: boolean;

  @ApiProperty()
  canAdd!: boolean;

  @ApiProperty()
  canEditInfo!: boolean;

  @ApiProperty({ description: 'May start a group call.' })
  canCall!: boolean;

  @ApiProperty({ description: 'May kick members, change settings, pin.' })
  isAdmin!: boolean;

  @ApiProperty()
  inviteEnabled!: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'The join link — for admins, or for everyone who may add people; null otherwise / when off.',
  })
  inviteLink!: string | null;

  @ApiPropertyOptional({ type: GroupMessageDto, nullable: true })
  pinnedMessage!: GroupMessageDto | null;

  @ApiPropertyOptional({ type: GroupMessageDto, nullable: true })
  lastMessage!: GroupMessageDto | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  lastMessageAt!: Date | null;

  @ApiProperty()
  unreadCount!: number;

  @ApiProperty({ description: 'Unread messages that @mention me.' })
  unreadMentions!: number;

  @ApiPropertyOptional({ type: Date, nullable: true })
  mutedUntil!: Date | null;

  @ApiProperty()
  pinned!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class GroupDetailDto extends GroupDto {
  @ApiProperty({ type: [GroupMemberDto] })
  members!: GroupMemberDto[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'Only after adding members: people who could not be added (blocked, inactive or their privacy settings).',
  })
  notAdded?: string[];
}

export class GroupInvitePreviewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    description: 'Pass this to POST /groups/join/{code} (username or invite).',
  })
  code!: string;

  @ApiProperty({ enum: GROUP_TYPES, enumName: 'GroupType' })
  type!: GroupTypeName;

  @ApiPropertyOptional({ type: String, nullable: true })
  username!: string | null;

  @ApiProperty({ description: 'Joining needs an admin to approve.' })
  requiresApproval!: boolean;

  @ApiProperty({ description: 'I already asked to join.' })
  requestPending!: boolean;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiProperty()
  memberCount!: number;

  @ApiProperty({ description: 'I am already in this group.' })
  alreadyMember!: boolean;
}

export class GroupJoinResultDto {
  @ApiProperty({ enum: ['joined', 'pending'] })
  status!: 'joined' | 'pending';

  @ApiProperty({ format: 'uuid' })
  groupId!: string;

  @ApiPropertyOptional({
    type: GroupDetailDto,
    nullable: true,
    description: 'The group, once I am in.',
  })
  group!: GroupDetailDto | null;
}

export class GroupJoinRequestDto {
  @ApiProperty({ type: GroupPersonDto })
  user!: GroupPersonDto;

  @ApiProperty()
  createdAt!: Date;
}

export class SearchGroupsQueryDto {
  @ApiProperty({ minLength: 2, maxLength: 60 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  q!: string;
}

export class GroupRequestParamDto extends GroupIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  userId!: string;
}

export class GroupTopicParamDto extends GroupIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  topicId!: string;
}

export class CreateTopicDto {
  @ApiProperty({ maxLength: TOPIC_TITLE_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(TOPIC_TITLE_MAX)
  title!: string;

  @ApiPropertyOptional({ maxLength: 16, description: 'One emoji.' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  iconEmoji?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: TOPIC_COLORS - 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(TOPIC_COLORS - 1)
  color?: number;
}

export class UpdateTopicDto {
  @ApiPropertyOptional({ maxLength: TOPIC_TITLE_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(TOPIC_TITLE_MAX)
  title?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 16 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(16)
  iconEmoji?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: TOPIC_COLORS - 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(TOPIC_COLORS - 1)
  color?: number;

  @ApiPropertyOptional({ description: 'Close (true) / reopen (false).' })
  @IsOptional()
  @IsBoolean()
  closed?: boolean;

  @ApiPropertyOptional({ description: 'Pin to the top of the topics.' })
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

export class GroupTopicDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    description: 'For «General» the app shows its own localized name.',
  })
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  iconEmoji!: string | null;

  @ApiProperty({ description: 'Palette index 0–6.' })
  color!: number;

  @ApiProperty()
  isGeneral!: boolean;

  @ApiProperty()
  closed!: boolean;

  @ApiProperty()
  pinned!: boolean;

  @ApiPropertyOptional({ type: GroupMessageDto, nullable: true })
  lastMessage!: GroupMessageDto | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  lastMessageAt!: Date | null;

  @ApiProperty()
  unreadCount!: number;

  @ApiProperty()
  unreadMentions!: number;

  @ApiProperty()
  createdAt!: Date;
}

export class GroupReadResultDto {
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  lastReadMessageId!: string | null;
}

export interface GroupPage {
  items: GroupDto[];
  nextCursor: string | null;
}
export interface GroupMessagePage {
  items: GroupMessageDto[];
  nextCursor: string | null;
}
