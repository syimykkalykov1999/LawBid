// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_reposter_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostReposterDto _$PostReposterDtoFromJson(Map<String, dynamic> json) =>
    PostReposterDto(
      id: json['id'] as String,
      username: json['username'] as String,
      name: json['name'] as String,
      role: PostReposterDtoRole.fromJson(json['role'] as String),
    );

Map<String, dynamic> _$PostReposterDtoToJson(PostReposterDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'username': instance.username,
      'name': instance.name,
      'role': instance.role.toJson(),
    };
