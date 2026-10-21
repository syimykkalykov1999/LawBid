// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_detail_dto_my_rights.dart';
import 'group_member_dto.dart';
import 'group_message_dto.dart';
import 'group_person_dto.dart';
import 'group_role.dart';
import 'group_type.dart';
import 'group_who.dart';
import 'ongoing_call_dto.dart';

part 'group_detail_dto.g.dart';

@JsonSerializable()
class GroupDetailDto {
  const GroupDetailDto({
    required this.callsMuted,
    required this.title,
    required this.memberCount,
    required this.type,
    required this.whoCanEditInfo,
    required this.joinApproval,
    required this.topicsEnabled,
    required this.pendingRequests,
    required this.whoCanPost,
    required this.whoCanAdd,
    required this.id,
    required this.whoCanCall,
    required this.whoCanMedia,
    required this.whoCanPoll,
    required this.whoCanPin,
    required this.myRights,
    required this.showServiceMessages,
    required this.inviteEnabled,
    required this.canPost,
    required this.canAdd,
    required this.canEditInfo,
    required this.canCall,
    required this.isAdmin,
    required this.unreadMentions,
    required this.invited,
    required this.members,
    required this.createdAt,
    required this.updatedAt,
    required this.pinned,
    required this.unreadCount,
    this.inviteLink,
    this.pinnedMessage,
    this.lastMessage,
    this.lastMessageAt,
    this.notAdded,
    this.protectContent,
    this.mutedUntil,
    this.username,
    this.ongoingCall,
    this.myRole,
    this.generalTopicId,
    this.avatarFullUrl,
    this.avatarUrl,
    this.description,
    this.disappearAfterS,
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
  final GroupWho whoCanMedia;
  final GroupWho whoCanPoll;
  final GroupWho whoCanPin;

  /// What I may do as owner / admin (empty for a member).
  final List<GroupDetailDtoMyRights> myRights;

  /// Service lines (joined, left, renamed…) are shown to everyone.
  final bool showServiceMessages;

  /// Disappearing messages: seconds a new message lives (86400 / 604800 / 7776000); null = off.
  final num? disappearAfterS;

  /// Restrict saving content: no forwarding, copying or saving of the messages; sharing sends the link.
  final bool? protectContent;

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

  /// Group calls ring silently for me.
  final bool callsMuted;

  /// Owner 2026-10-21 (Telegram «Видеочат»): the call running in the group now (members only).
  final OngoingCallDto? ongoingCall;
  final bool pinned;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<GroupMemberDto> members;

  /// Owner 2026-10-21: people invited and not answered yet (only for those who can invite).
  final List<GroupPersonDto> invited;

  /// Only after inviting: people who could not be invited (blocked, inactive, their privacy settings, or declined less than a day ago).
  final List<String>? notAdded;

  Map<String, Object?> toJson() => _$GroupDetailDtoToJson(this);
}
