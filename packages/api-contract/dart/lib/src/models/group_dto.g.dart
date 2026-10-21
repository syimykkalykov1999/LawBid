// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupDto _$GroupDtoFromJson(Map<String, dynamic> json) => GroupDto(
  whoCanAdd: GroupWho.fromJson(json['whoCanAdd'] as String),
  title: json['title'] as String,
  createdAt: DateTime.parse(json['createdAt'] as String),
  pinned: json['pinned'] as bool,
  callsMuted: json['callsMuted'] as bool,
  memberCount: json['memberCount'] as num,
  type: GroupType.fromJson(json['type'] as String),
  unreadMentions: json['unreadMentions'] as num,
  joinApproval: json['joinApproval'] as bool,
  topicsEnabled: json['topicsEnabled'] as bool,
  unreadCount: json['unreadCount'] as num,
  pendingRequests: json['pendingRequests'] as num,
  inviteEnabled: json['inviteEnabled'] as bool,
  whoCanPost: GroupWho.fromJson(json['whoCanPost'] as String),
  id: json['id'] as String,
  whoCanEditInfo: GroupWho.fromJson(json['whoCanEditInfo'] as String),
  whoCanCall: GroupWho.fromJson(json['whoCanCall'] as String),
  whoCanMedia: GroupWho.fromJson(json['whoCanMedia'] as String),
  whoCanPoll: GroupWho.fromJson(json['whoCanPoll'] as String),
  whoCanPin: GroupWho.fromJson(json['whoCanPin'] as String),
  myRights: (json['myRights'] as List<dynamic>)
      .map((e) => GroupDtoMyRights.fromJson(e as String))
      .toList(),
  showServiceMessages: json['showServiceMessages'] as bool,
  isAdmin: json['isAdmin'] as bool,
  protectContent: json['protectContent'] as bool,
  canPost: json['canPost'] as bool,
  canAdd: json['canAdd'] as bool,
  updatedAt: DateTime.parse(json['updatedAt'] as String),
  canCall: json['canCall'] as bool,
  canEditInfo: json['canEditInfo'] as bool,
  myRole: json['myRole'] == null
      ? null
      : GroupRole.fromJson(json['myRole'] as String),
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
  disappearAfterS: json['disappearAfterS'] as num?,
);

Map<String, dynamic> _$GroupDtoToJson(GroupDto instance) => <String, dynamic>{
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
  'whoCanMedia': instance.whoCanMedia.toJson(),
  'whoCanPoll': instance.whoCanPoll.toJson(),
  'whoCanPin': instance.whoCanPin.toJson(),
  'myRights': instance.myRights.map((e) => e.toJson()).toList(),
  'showServiceMessages': instance.showServiceMessages,
  'disappearAfterS': ?instance.disappearAfterS,
  'protectContent': instance.protectContent,
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
  'callsMuted': instance.callsMuted,
  'pinned': instance.pinned,
  'createdAt': instance.createdAt.toIso8601String(),
  'updatedAt': instance.updatedAt.toIso8601String(),
};
