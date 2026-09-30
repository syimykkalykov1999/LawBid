// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'call_peer_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CallPeerDto _$CallPeerDtoFromJson(Map<String, dynamic> json) => CallPeerDto(
  id: json['id'] as String,
  kind: CallPeerDtoKind.fromJson(json['kind'] as String),
  displayName: json['displayName'] as String?,
  username: json['username'] as String?,
  avatarUrl: json['avatarUrl'] as String?,
);

Map<String, dynamic> _$CallPeerDtoToJson(CallPeerDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'displayName': ?instance.displayName,
      'username': ?instance.username,
      'avatarUrl': ?instance.avatarUrl,
      'kind': instance.kind.toJson(),
    };
