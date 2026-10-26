// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_topic_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupTopicDto _$GroupTopicDtoFromJson(Map<String, dynamic> json) =>
    GroupTopicDto(
      id: json['id'] as String,
      title: json['title'] as String,
      color: json['color'] as num,
      isGeneral: json['isGeneral'] as bool,
      closed: json['closed'] as bool,
      pinned: json['pinned'] as bool,
      unreadCount: json['unreadCount'] as num,
      unreadMentions: json['unreadMentions'] as num,
      createdAt: DateTime.parse(json['createdAt'] as String),
      iconEmoji: json['iconEmoji'] as String?,
      lastMessage: json['lastMessage'] == null
          ? null
          : GroupMessageDto.fromJson(
              json['lastMessage'] as Map<String, dynamic>,
            ),
      lastMessageAt: json['lastMessageAt'] == null
          ? null
          : DateTime.parse(json['lastMessageAt'] as String),
    );

Map<String, dynamic> _$GroupTopicDtoToJson(GroupTopicDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'iconEmoji': ?instance.iconEmoji,
      'color': instance.color,
      'isGeneral': instance.isGeneral,
      'closed': instance.closed,
      'pinned': instance.pinned,
      'lastMessage': ?instance.lastMessage?.toJson(),
      'lastMessageAt': ?instance.lastMessageAt?.toIso8601String(),
      'unreadCount': instance.unreadCount,
      'unreadMentions': instance.unreadMentions,
      'createdAt': instance.createdAt.toIso8601String(),
    };
