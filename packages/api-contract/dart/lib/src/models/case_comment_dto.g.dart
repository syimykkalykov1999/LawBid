// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_comment_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseCommentDto _$CaseCommentDtoFromJson(Map<String, dynamic> json) =>
    CaseCommentDto(
      id: json['id'] as String,
      caseId: json['caseId'] as String,
      author: CommentAuthorDto.fromJson(json['author'] as Map<String, dynamic>),
      byCaseOwner: json['byCaseOwner'] as bool,
      body: json['body'] as String,
      likeCount: (json['likeCount'] as num).toInt(),
      replyCount: (json['replyCount'] as num).toInt(),
      likedByMe: json['likedByMe'] as bool,
      canDelete: json['canDelete'] as bool,
      isMine: json['isMine'] as bool,
      createdAt: json['createdAt'] as String,
      parentCommentId: json['parentCommentId'] as String?,
    );

Map<String, dynamic> _$CaseCommentDtoToJson(CaseCommentDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'caseId': instance.caseId,
      'parentCommentId': ?instance.parentCommentId,
      'author': instance.author.toJson(),
      'byCaseOwner': instance.byCaseOwner,
      'body': instance.body,
      'likeCount': instance.likeCount,
      'replyCount': instance.replyCount,
      'likedByMe': instance.likedByMe,
      'canDelete': instance.canDelete,
      'isMine': instance.isMine,
      'createdAt': instance.createdAt,
    };
