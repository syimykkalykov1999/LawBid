// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'contact_person_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContactPersonDto _$ContactPersonDtoFromJson(Map<String, dynamic> json) =>
    ContactPersonDto(
      hash: json['hash'] as String,
      userId: json['userId'] as String,
      displayName: json['displayName'] as String,
      username: json['username'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      role: json['role'] == null
          ? null
          : ContactPersonDtoRole.fromJson(json['role'] as String),
    );

Map<String, dynamic> _$ContactPersonDtoToJson(ContactPersonDto instance) =>
    <String, dynamic>{
      'hash': instance.hash,
      'userId': instance.userId,
      'username': ?instance.username,
      'displayName': instance.displayName,
      'avatarUrl': ?instance.avatarUrl,
      'role': ?instance.role?.toJson(),
    };
