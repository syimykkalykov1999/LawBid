// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'comment_author_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CommentAuthorDto _$CommentAuthorDtoFromJson(Map<String, dynamic> json) =>
    CommentAuthorDto(
      kind: CommentAuthorDtoKind.fromJson(json['kind'] as String),
      displayName: json['displayName'] as String,
      verifiedBadge: json['verifiedBadge'] as bool,
      attorneyId: json['attorneyId'] as String?,
      username: json['username'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
    );

Map<String, dynamic> _$CommentAuthorDtoToJson(CommentAuthorDto instance) =>
    <String, dynamic>{
      'kind': instance.kind.toJson(),
      'attorneyId': ?instance.attorneyId,
      'username': ?instance.username,
      'displayName': instance.displayName,
      'avatarUrl': ?instance.avatarUrl,
      'verifiedBadge': instance.verifiedBadge,
    };
