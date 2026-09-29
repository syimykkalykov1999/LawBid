// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_comment_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateCommentDto _$CreateCommentDtoFromJson(Map<String, dynamic> json) =>
    CreateCommentDto(
      body: json['body'] as String,
      parentCommentId: json['parentCommentId'] as String?,
    );

Map<String, dynamic> _$CreateCommentDtoToJson(CreateCommentDto instance) =>
    <String, dynamic>{
      'body': instance.body,
      'parentCommentId': ?instance.parentCommentId,
    };
