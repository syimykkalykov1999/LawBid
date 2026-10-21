// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'channel_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChannelDto _$ChannelDtoFromJson(Map<String, dynamic> json) => ChannelDto(
  id: json['id'] as String,
  title: json['title'] as String,
  username: json['username'] as String,
  commentsEnabled: json['commentsEnabled'] as bool,
  status: ChannelStatus.fromJson(json['status'] as String),
  subscriberCount: (json['subscriberCount'] as num).toInt(),
  postCount: (json['postCount'] as num).toInt(),
  owner: UserBriefDto.fromJson(json['owner'] as Map<String, dynamic>),
  isSubscribed: json['isSubscribed'] as bool,
  isMuted: json['isMuted'] as bool,
  createdAt: DateTime.parse(json['createdAt'] as String),
  description: json['description'] as String?,
  avatarUrl: json['avatarUrl'] as String?,
  avatarFullUrl: json['avatarFullUrl'] as String?,
  protectContent: json['protectContent'] as bool?,
  whoCanPost: json['whoCanPost'] == null
      ? null
      : ChannelWho.fromJson(json['whoCanPost'] as String),
  canPost: json['canPost'] as bool?,
  reactionsMode: json['reactionsMode'] == null
      ? null
      : ReactionMode.fromJson(json['reactionsMode'] as String),
  reactionsAllowed: (json['reactionsAllowed'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  myRole: json['myRole'] == null
      ? null
      : ChannelRole.fromJson(json['myRole'] as String),
  lastPostAt: json['lastPostAt'] == null
      ? null
      : DateTime.parse(json['lastPostAt'] as String),
);

Map<String, dynamic> _$ChannelDtoToJson(ChannelDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'username': instance.username,
      'description': ?instance.description,
      'avatarUrl': ?instance.avatarUrl,
      'avatarFullUrl': ?instance.avatarFullUrl,
      'commentsEnabled': instance.commentsEnabled,
      'protectContent': ?instance.protectContent,
      'whoCanPost': ?instance.whoCanPost?.toJson(),
      'canPost': ?instance.canPost,
      'reactionsMode': ?instance.reactionsMode?.toJson(),
      'reactionsAllowed': ?instance.reactionsAllowed,
      'status': instance.status.toJson(),
      'subscriberCount': instance.subscriberCount,
      'postCount': instance.postCount,
      'owner': instance.owner.toJson(),
      'isSubscribed': instance.isSubscribed,
      'isMuted': instance.isMuted,
      'myRole': ?instance.myRole?.toJson(),
      'lastPostAt': ?instance.lastPostAt?.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
