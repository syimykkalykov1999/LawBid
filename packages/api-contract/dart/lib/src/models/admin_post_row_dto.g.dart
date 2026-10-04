// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_post_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPostRowDto _$AdminPostRowDtoFromJson(Map<String, dynamic> json) =>
    AdminPostRowDto(
      id: json['id'] as String,
      kind: AdminPostRowDtoKind.fromJson(json['kind'] as String),
      body: json['body'] as String,
      authorId: json['authorId'] as String,
      authorName: json['authorName'] as String,
      status: AdminPostRowDtoStatus.fromJson(json['status'] as String),
      likes: (json['likes'] as num).toInt(),
      comments: (json['comments'] as num).toInt(),
      deleted: json['deleted'] as bool,
      hasVideo: json['hasVideo'] as bool,
      createdAt: json['createdAt'] as String,
      title: json['title'] as String?,
      practice: json['practice'] as String?,
    );

Map<String, dynamic> _$AdminPostRowDtoToJson(AdminPostRowDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'kind': instance.kind.toJson(),
      'title': ?instance.title,
      'body': instance.body,
      'authorId': instance.authorId,
      'authorName': instance.authorName,
      'practice': ?instance.practice,
      'status': instance.status.toJson(),
      'likes': instance.likes,
      'comments': instance.comments,
      'deleted': instance.deleted,
      'hasVideo': instance.hasVideo,
      'createdAt': instance.createdAt,
    };
