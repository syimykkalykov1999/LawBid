// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conversation_counterpart_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConversationCounterpartDto _$ConversationCounterpartDtoFromJson(
  Map<String, dynamic> json,
) => ConversationCounterpartDto(
  kind: ConversationCounterpartDtoKind.fromJson(json['kind'] as String),
  verifiedBadge: json['verifiedBadge'] as bool,
  id: json['id'] as String?,
  displayName: json['displayName'] as String?,
  username: json['username'] as String?,
  avatarUrl: json['avatarUrl'] as String?,
  online: json['online'] as bool?,
  lastSeenAt: json['lastSeenAt'] == null
      ? null
      : DateTime.parse(json['lastSeenAt'] as String),
);

Map<String, dynamic> _$ConversationCounterpartDtoToJson(
  ConversationCounterpartDto instance,
) => <String, dynamic>{
  'id': ?instance.id,
  'kind': instance.kind.toJson(),
  'displayName': ?instance.displayName,
  'username': ?instance.username,
  'avatarUrl': ?instance.avatarUrl,
  'verifiedBadge': instance.verifiedBadge,
  'online': ?instance.online,
  'lastSeenAt': ?instance.lastSeenAt?.toIso8601String(),
};
