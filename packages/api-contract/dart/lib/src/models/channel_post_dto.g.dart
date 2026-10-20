// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'channel_post_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChannelPostDto _$ChannelPostDtoFromJson(Map<String, dynamic> json) =>
    ChannelPostDto(
      id: json['id'] as String,
      channelId: json['channelId'] as String,
      author: UserBriefDto.fromJson(json['author'] as Map<String, dynamic>),
      body: json['body'] as String,
      media: (json['media'] as List<dynamic>)
          .map((e) => ChannelMediaDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      viewCount: (json['viewCount'] as num).toInt(),
      commentCount: (json['commentCount'] as num).toInt(),
      shareCount: (json['shareCount'] as num).toInt(),
      reactions: (json['reactions'] as List<dynamic>)
          .map(
            (e) => ChannelReactionCountDto.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      video: json['video'] == null
          ? null
          : PostVideoDto.fromJson(json['video'] as Map<String, dynamic>),
      myReaction: json['myReaction'] as String?,
      editedAt: json['editedAt'] == null
          ? null
          : DateTime.parse(json['editedAt'] as String),
    );

Map<String, dynamic> _$ChannelPostDtoToJson(ChannelPostDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'channelId': instance.channelId,
      'author': instance.author.toJson(),
      'body': instance.body,
      'media': instance.media.map((e) => e.toJson()).toList(),
      'video': ?instance.video?.toJson(),
      'viewCount': instance.viewCount,
      'commentCount': instance.commentCount,
      'shareCount': instance.shareCount,
      'reactions': instance.reactions.map((e) => e.toJson()).toList(),
      'myReaction': ?instance.myReaction,
      'createdAt': instance.createdAt.toIso8601String(),
      'editedAt': ?instance.editedAt?.toIso8601String(),
    };
