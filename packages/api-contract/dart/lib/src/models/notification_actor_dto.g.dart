// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'notification_actor_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NotificationActorDto _$NotificationActorDtoFromJson(
  Map<String, dynamic> json,
) => NotificationActorDto(
  displayName: json['displayName'] as String,
  id: json['id'] as String?,
  username: json['username'] as String?,
  avatarUrl: json['avatarUrl'] as String?,
);

Map<String, dynamic> _$NotificationActorDtoToJson(
  NotificationActorDto instance,
) => <String, dynamic>{
  'id': ?instance.id,
  'displayName': instance.displayName,
  'username': ?instance.username,
  'avatarUrl': ?instance.avatarUrl,
};
