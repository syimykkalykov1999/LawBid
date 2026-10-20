// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_person_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupPersonDto _$GroupPersonDtoFromJson(Map<String, dynamic> json) =>
    GroupPersonDto(
      userId: json['userId'] as String,
      kind: GroupPersonDtoKind.fromJson(json['kind'] as String),
      verifiedBadge: json['verifiedBadge'] as bool,
      displayName: json['displayName'] as String?,
      username: json['username'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
    );

Map<String, dynamic> _$GroupPersonDtoToJson(GroupPersonDto instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'displayName': ?instance.displayName,
      'username': ?instance.username,
      'avatarUrl': ?instance.avatarUrl,
      'kind': instance.kind.toJson(),
      'verifiedBadge': instance.verifiedBadge,
    };
