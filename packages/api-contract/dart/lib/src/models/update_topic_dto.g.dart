// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_topic_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateTopicDto _$UpdateTopicDtoFromJson(Map<String, dynamic> json) =>
    UpdateTopicDto(
      title: json['title'] as String?,
      iconEmoji: json['iconEmoji'] as String?,
      color: json['color'] as num?,
      closed: json['closed'] as bool?,
      pinned: json['pinned'] as bool?,
    );

Map<String, dynamic> _$UpdateTopicDtoToJson(UpdateTopicDto instance) =>
    <String, dynamic>{
      'title': ?instance.title,
      'iconEmoji': ?instance.iconEmoji,
      'color': ?instance.color,
      'closed': ?instance.closed,
      'pinned': ?instance.pinned,
    };
