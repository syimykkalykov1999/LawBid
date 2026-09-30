// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'comment_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CommentDto _$CommentDtoFromJson(Map<String, dynamic> json) => CommentDto(
  id: json['id'] as String,
  postId: json['postId'] as String,
  author: CommentAuthorDto.fromJson(json['author'] as Map<String, dynamic>),
  body: json['body'] as String,
  mentions: (json['mentions'] as List<dynamic>)
      .map((e) => MentionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  likeCount: (json['likeCount'] as num).toInt(),
  replyCount: (json['replyCount'] as num).toInt(),
  likedByMe: json['likedByMe'] as bool,
  canDelete: json['canDelete'] as bool,
  isMine: json['isMine'] as bool,
  createdAt: json['createdAt'] as String,
  parentCommentId: json['parentCommentId'] as String?,
);

Map<String, dynamic> _$CommentDtoToJson(CommentDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'postId': instance.postId,
      'parentCommentId': ?instance.parentCommentId,
      'author': instance.author.toJson(),
      'body': instance.body,
      'mentions': instance.mentions.map((e) => e.toJson()).toList(),
      'likeCount': instance.likeCount,
      'replyCount': instance.replyCount,
      'likedByMe': instance.likedByMe,
      'canDelete': instance.canDelete,
      'isMine': instance.isMine,
      'createdAt': instance.createdAt,
    };
