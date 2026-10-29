// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupDto _$GroupDtoFromJson(Map<String, dynamic> json) => GroupDto(
  showServiceMessages: json['showServiceMessages'] as bool,
  title: json['title'] as String,
  memberCount: json['memberCount'] as num,
  type: GroupType.fromJson(json['type'] as String),
  whoCanAdd: GroupWho.fromJson(json['whoCanAdd'] as String),
  joinApproval: json['joinApproval'] as bool,
  topicsEnabled: json['topicsEnabled'] as bool,
  pendingRequests: json['pendingRequests'] as num,
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
  canEditInfo: json['canEditInfo'] as bool,
  canPost: json['canPost'] as bool,
  canAdd: json['canAdd'] as bool,
  pinned: json['pinned'] as bool,
  unreadMentions: json['unreadMentions'] as num,
  callsMuted: json['callsMuted'] as bool,
  inviteEnabled: json['inviteEnabled'] as bool,
  isAdmin: json['isAdmin'] as bool,
  canCall: json['canCall'] as bool,
  updatedAt: DateTime.parse(json['updatedAt'] as String),
  unreadCount: json['unreadCount'] as num,
  createdAt: DateTime.parse(json['createdAt'] as String),
  reactionsAllowed: (json['reactionsAllowed'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  reactionsMode: json['reactionsMode'] == null
      ? null
      : ReactionMode.fromJson(json['reactionsMode'] as String),
  protectContent: json['protectContent'] as bool?,
  disappearAfterS: json['disappearAfterS'] as num?,
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
  myRole: json['myRole'] == null
      ? null
      : GroupRole.fromJson(json['myRole'] as String),
  generalTopicId: json['generalTopicId'] as String?,
  mutedUntil: json['mutedUntil'] == null
      ? null
      : DateTime.parse(json['mutedUntil'] as String),
  avatarFullUrl: json['avatarFullUrl'] as String?,
  avatarUrl: json['avatarUrl'] as String?,
  description: json['description'] as String?,
  username: json['username'] as String?,
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
  'protectContent': ?instance.protectContent,
  'reactionsMode': ?instance.reactionsMode?.toJson(),
  'reactionsAllowed': ?instance.reactionsAllowed,
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
