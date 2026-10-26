// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_author_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostAuthorDto _$PostAuthorDtoFromJson(Map<String, dynamic> json) =>
    PostAuthorDto(
      id: json['id'] as String,
      role: PostAuthorDtoRole.fromJson(json['role'] as String),
      username: json['username'] as String,
      verifiedBadge: json['verifiedBadge'] as bool,
      isFollowing: json['isFollowing'] as bool,
      trustLevel: json['trustLevel'] as num,
      practiceI18nKeys: (json['practiceI18nKeys'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      advertisingLabel: json['advertisingLabel'] as bool,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      identityRejected: json['identityRejected'] as bool?,
      location: json['location'] as String?,
    );

Map<String, dynamic> _$PostAuthorDtoToJson(PostAuthorDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'role': instance.role.toJson(),
      'username': instance.username,
      'firstName': ?instance.firstName,
      'lastName': ?instance.lastName,
      'avatarUrl': ?instance.avatarUrl,
      'verifiedBadge': instance.verifiedBadge,
      'isFollowing': instance.isFollowing,
      'trustLevel': instance.trustLevel,
      'identityRejected': ?instance.identityRejected,
      'practiceI18nKeys': instance.practiceI18nKeys,
      'location': ?instance.location,
      'advertisingLabel': instance.advertisingLabel,
    };
