// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ice_server_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IceServerDto _$IceServerDtoFromJson(Map<String, dynamic> json) => IceServerDto(
  urls: (json['urls'] as List<dynamic>).map((e) => e as String).toList(),
  username: json['username'] as String?,
  credential: json['credential'] as String?,
);

Map<String, dynamic> _$IceServerDtoToJson(IceServerDto instance) =>
    <String, dynamic>{
      'urls': instance.urls,
      'username': ?instance.username,
      'credential': ?instance.credential,
    };
