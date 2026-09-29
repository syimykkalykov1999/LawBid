// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'notification_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NotificationDto _$NotificationDtoFromJson(Map<String, dynamic> json) =>
    NotificationDto(
      id: json['id'] as String,
      type: json['type'] as String,
      category: NotificationDtoCategory.fromJson(json['category'] as String),
      payload: json['payload'],
      aggregateCount: json['aggregateCount'] as num,
      createdAt: DateTime.parse(json['createdAt'] as String),
      actor: json['actor'] == null
          ? null
          : NotificationActorDto.fromJson(
              json['actor'] as Map<String, dynamic>,
            ),
      readAt: json['readAt'] == null
          ? null
          : DateTime.parse(json['readAt'] as String),
    );

Map<String, dynamic> _$NotificationDtoToJson(NotificationDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'type': instance.type,
      'category': instance.category.toJson(),
      'payload': ?instance.payload,
      'actor': ?instance.actor?.toJson(),
      'aggregateCount': instance.aggregateCount,
      'readAt': ?instance.readAt?.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
