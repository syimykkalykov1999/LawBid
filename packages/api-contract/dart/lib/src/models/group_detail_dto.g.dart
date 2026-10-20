// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_detail_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupDetailDto _$GroupDetailDtoFromJson(
  Map<String, dynamic> json,
) => GroupDetailDto(
  pendingRequests: json['pendingRequests'] as num,
  title: json['title'] as String,
  updatedAt: DateTime.parse(json['updatedAt'] as String),
  createdAt: DateTime.parse(json['createdAt'] as String),
  pinned: json['pinned'] as bool,
  memberCount: json['memberCount'] as num,
  type: GroupType.fromJson(json['type'] as String),
  unreadMentions: json['unreadMentions'] as num,
  joinApproval: json['joinApproval'] as bool,
  topicsEnabled: json['topicsEnabled'] as bool,
  unreadCount: json['unreadCount'] as num,
  id: json['id'] as String,
  inviteEnabled: json['inviteEnabled'] as bool,
  whoCanPost: GroupWho.fromJson(json['whoCanPost'] as String),
  whoCanAdd: GroupWho.fromJson(json['whoCanAdd'] as String),
  whoCanEditInfo: GroupWho.fromJson(json['whoCanEditInfo'] as String),
  whoCanCall: GroupWho.fromJson(json['whoCanCall'] as String),
  canPost: json['canPost'] as bool,
  canAdd: json['canAdd'] as bool,
  canEditInfo: json['canEditInfo'] as bool,
  canCall: json['canCall'] as bool,
  members: (json['members'] as List<dynamic>)
      .map((e) => GroupMemberDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  isAdmin: json['isAdmin'] as bool,
  inviteLink: json['inviteLink'] as String?,
  pinnedMessage: json['pinnedMessage'] == null
      ? null
      : GroupMessageDto.fromJson(json['pinnedMessage'] as Map<String, dynamic>),
  lastMessage: json['lastMessage'] == null
      ? null
      : GroupMessageDto.fromJson(json['lastMessage'] as Map<String, dynamic>),
  lastMessageAt: json['lastMessageAt'] == null
      ? null
      : DateTime.parse(json['lastMessageAt'] as String),
  generalTopicId: json['generalTopicId'] as String?,
  username: json['username'] as String?,
  mutedUntil: json['mutedUntil'] == null
      ? null
      : DateTime.parse(json['mutedUntil'] as String),
  avatarFullUrl: json['avatarFullUrl'] as String?,
  avatarUrl: json['avatarUrl'] as String?,
  description: json['description'] as String?,
  myRole: json['myRole'] == null
      ? null
      : GroupRole.fromJson(json['myRole'] as String),
);

Map<String, dynamic> _$GroupDetailDtoToJson(GroupDetailDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'description': ?instance.description,
      'avatarUrl': ?instance.avatarUrl,
      'avatarFullUrl': ?instance.avatarFullUrl,
      'memberCount': instance.memberCount,
      'type': instance.type.toJson(),
      'username': ?instance.username,
      'joinApproval': instance.joinApproval,
      'topicsEnabled': instance.topicsEnabled,
      'generalTopicId': ?instance.generalTopicId,
      'pendingRequests': instance.pendingRequests,
      'myRole': ?instance.myRole?.toJson(),
      'whoCanPost': instance.whoCanPost.toJson(),
      'whoCanAdd': instance.whoCanAdd.toJson(),
      'whoCanEditInfo': instance.whoCanEditInfo.toJson(),
      'whoCanCall': instance.whoCanCall.toJson(),
      'canPost': instance.canPost,
      'canAdd': instance.canAdd,
      'canEditInfo': instance.canEditInfo,
      'canCall': instance.canCall,
      'isAdmin': instance.isAdmin,
      'inviteEnabled': instance.inviteEnabled,
      'inviteLink': ?instance.inviteLink,
      'pinnedMessage': ?instance.pinnedMessage?.toJson(),
      'lastMessage': ?instance.lastMessage?.toJson(),
      'lastMessageAt': ?instance.lastMessageAt?.toIso8601String(),
      'unreadCount': instance.unreadCount,
      'unreadMentions': instance.unreadMentions,
      'mutedUntil': ?instance.mutedUntil?.toIso8601String(),
      'pinned': instance.pinned,
      'createdAt': instance.createdAt.toIso8601String(),
      'updatedAt': instance.updatedAt.toIso8601String(),
      'members': instance.members.map((e) => e.toJson()).toList(),
    };
