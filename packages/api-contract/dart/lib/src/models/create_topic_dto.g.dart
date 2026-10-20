// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_topic_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateTopicDto _$CreateTopicDtoFromJson(Map<String, dynamic> json) =>
    CreateTopicDto(
      title: json['title'] as String,
      iconEmoji: json['iconEmoji'] as String?,
      color: json['color'] as num?,
    );

Map<String, dynamic> _$CreateTopicDtoToJson(CreateTopicDto instance) =>
    <String, dynamic>{
      'title': instance.title,
      'iconEmoji': ?instance.iconEmoji,
      'color': ?instance.color,
    };
