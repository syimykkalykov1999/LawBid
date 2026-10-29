// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_dto_my_rights.dart';
import 'group_message_dto.dart';
import 'group_role.dart';
import 'group_type.dart';
import 'group_who.dart';
import 'reaction_mode.dart';

part 'group_dto.g.dart';

@JsonSerializable()
class GroupDto {
  const GroupDto({
    required this.showServiceMessages,
    required this.title,
    required this.memberCount,
    required this.type,
    required this.whoCanAdd,
    required this.joinApproval,
    required this.topicsEnabled,
    required this.pendingRequests,
    required this.whoCanPost,
    required this.id,
    required this.whoCanEditInfo,
    required this.whoCanCall,
    required this.whoCanMedia,
    required this.whoCanPoll,
    required this.whoCanPin,
    required this.myRights,
    required this.canEditInfo,
    required this.canPost,
    required this.canAdd,
    required this.pinned,
    required this.unreadMentions,
    required this.callsMuted,
    required this.inviteEnabled,
    required this.isAdmin,
    required this.canCall,
    required this.updatedAt,
    required this.unreadCount,
    required this.createdAt,
    this.reactionsAllowed,
    this.reactionsMode,
    this.protectContent,
    this.disappearAfterS,
    this.inviteLink,
    this.pinnedMessage,
    this.lastMessage,
    this.lastMessageAt,
    this.myRole,
    this.generalTopicId,
    this.mutedUntil,
    this.avatarFullUrl,
    this.avatarUrl,
    this.description,
    this.username,
  });

  factory GroupDto.fromJson(Map<String, Object?> json) =>
      _$GroupDtoFromJson(json);

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
  final List<GroupDtoMyRights> myRights;

  /// Service lines (joined, left, renamed…) are shown to everyone.
  final bool showServiceMessages;

  /// Disappearing messages: seconds a new message lives (86400 / 604800 / 7776000); null = off.
  final num? disappearAfterS;

  /// Restrict saving content: no forwarding, copying or saving of the messages; sharing sends the link.
  final bool? protectContent;

  /// Owner 2026-10-21 (inbox 26c): all / selected / off.
  final ReactionMode? reactionsMode;

  /// The selected reactions (mode «some»), palette order.
  final List<String>? reactionsAllowed;

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
  final bool pinned;
  final DateTime createdAt;
  final DateTime updatedAt;

  Map<String, Object?> toJson() => _$GroupDtoToJson(this);
}
