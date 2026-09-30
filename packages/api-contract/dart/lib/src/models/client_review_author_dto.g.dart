// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'client_review_author_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClientReviewAuthorDto _$ClientReviewAuthorDtoFromJson(
  Map<String, dynamic> json,
) => ClientReviewAuthorDto(
  id: json['id'] as String,
  username: json['username'] as String,
  displayName: json['displayName'] as String,
  verifiedBadge: json['verifiedBadge'] as bool,
  avatarUrl: json['avatarUrl'] as String?,
);

Map<String, dynamic> _$ClientReviewAuthorDtoToJson(
  ClientReviewAuthorDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'username': instance.username,
  'displayName': instance.displayName,
  'avatarUrl': ?instance.avatarUrl,
  'verifiedBadge': instance.verifiedBadge,
};
