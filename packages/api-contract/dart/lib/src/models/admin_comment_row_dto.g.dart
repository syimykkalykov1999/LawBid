// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_comment_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCommentRowDto _$AdminCommentRowDtoFromJson(Map<String, dynamic> json) =>
    AdminCommentRowDto(
      id: json['id'] as String,
      thread: AdminCommentRowDtoThread.fromJson(json['thread'] as String),
      targetId: json['targetId'] as String,
      body: json['body'] as String,
      authorId: json['authorId'] as String,
      authorName: json['authorName'] as String,
      status: AdminCommentRowDtoStatus.fromJson(json['status'] as String),
      deleted: json['deleted'] as bool,
      createdAt: json['createdAt'] as String,
      targetTitle: json['targetTitle'] as String?,
    );

Map<String, dynamic> _$AdminCommentRowDtoToJson(AdminCommentRowDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'thread': instance.thread.toJson(),
      'targetId': instance.targetId,
      'targetTitle': ?instance.targetTitle,
      'body': instance.body,
      'authorId': instance.authorId,
      'authorName': instance.authorName,
      'status': instance.status.toJson(),
      'deleted': instance.deleted,
      'createdAt': instance.createdAt,
    };
