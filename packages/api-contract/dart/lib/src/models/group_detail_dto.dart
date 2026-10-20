// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_member_dto.dart';
import 'group_message_dto.dart';
import 'group_role.dart';
import 'group_type.dart';
import 'group_who.dart';

part 'group_detail_dto.g.dart';

@JsonSerializable()
class GroupDetailDto {
  const GroupDetailDto({
    required this.pendingRequests,
    required this.title,
    required this.members,
    required this.updatedAt,
    required this.createdAt,
    required this.memberCount,
    required this.type,
    required this.pinned,
    required this.joinApproval,
    required this.topicsEnabled,
    required this.unreadMentions,
    required this.id,
    required this.unreadCount,
    required this.whoCanPost,
    required this.whoCanAdd,
    required this.whoCanEditInfo,
    required this.whoCanCall,
    required this.showServiceMessages,
    required this.canPost,
    required this.canAdd,
    required this.canEditInfo,
    required this.canCall,
    required this.inviteEnabled,
    required this.isAdmin,
    this.inviteLink,
    this.pinnedMessage,
    this.lastMessage,
    this.lastMessageAt,
    this.myRole,
    this.generalTopicId,
    this.mutedUntil,
    this.username,
    this.avatarFullUrl,
    this.avatarUrl,
    this.description,
    this.notAdded,
  });

  factory GroupDetailDto.fromJson(Map<String, Object?> json) =>
      _$GroupDetailDtoFromJson(json);

  final String id;
  final String title;
  final String? description;
  final String? avatarUrl;
  final String? avatarFullUrl;
  final num memberCount;
  final GroupType type;

  /// Public groups: the @username (without @).
  final String? username;

  /// closed groups: new members need an admin.
  final bool joinApproval;

  /// Forum mode: the group has topics.
  final bool topicsEnabled;
  final String? generalTopicId;

  /// Admins: people waiting to be let in.
  final num pendingRequests;

  /// null = I am not (or no longer) a member.
  final GroupRole? myRole;
  final GroupWho whoCanPost;
  final GroupWho whoCanAdd;
  final GroupWho whoCanEditInfo;
  final GroupWho whoCanCall;

  /// Service lines (joined, left, renamed…) are shown to everyone.
  final bool showServiceMessages;

  /// What I may do here (derived from the above).
  final bool canPost;
  final bool canAdd;
  final bool canEditInfo;

  /// May start a group call.
  final bool canCall;

  /// May kick members, change settings, pin.
  final bool isAdmin;
  final bool inviteEnabled;

  /// The join link — for admins, or for everyone who may add people; null otherwise / when off.
  final String? inviteLink;
  final GroupMessageDto? pinnedMessage;
  final GroupMessageDto? lastMessage;
  final DateTime? lastMessageAt;
  final num unreadCount;

  /// Unread messages that @mention me.
  final num unreadMentions;
  final DateTime? mutedUntil;
  final bool pinned;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<GroupMemberDto> members;

  /// Only after adding members: people who could not be added (blocked, inactive or their privacy settings).
  final List<String>? notAdded;

  Map<String, Object?> toJson() => _$GroupDetailDtoToJson(this);
}
