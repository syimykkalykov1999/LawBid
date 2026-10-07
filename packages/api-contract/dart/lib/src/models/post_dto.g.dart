// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostDto _$PostDtoFromJson(Map<String, dynamic> json) => PostDto(
  id: json['id'] as String,
  kind: PostKind.fromJson(json['kind'] as String),
  contentClass: PostContentClass.fromJson(json['contentClass'] as String),
  author: PostAuthorDto.fromJson(json['author'] as Map<String, dynamic>),
  body: json['body'] as String,
  media: (json['media'] as List<dynamic>)
      .map((e) => PostMediaDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  attachments: (json['attachments'] as List<dynamic>)
      .map((e) => PostAttachmentDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  tags: (json['tags'] as List<dynamic>).map((e) => e as String).toList(),
  mentions: (json['mentions'] as List<dynamic>)
      .map((e) => MentionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  status: ContentStatus.fromJson(json['status'] as String),
  likeCount: (json['likeCount'] as num).toInt(),
  commentCount: (json['commentCount'] as num).toInt(),
  saveCount: (json['saveCount'] as num).toInt(),
  shareCount: (json['shareCount'] as num).toInt(),
  repostCount: (json['repostCount'] as num).toInt(),
  likedByMe: json['likedByMe'] as bool,
  repostedByMe: json['repostedByMe'] as bool,
  savedByMe: json['savedByMe'] as bool,
  isMine: json['isMine'] as bool,
  createdAt: json['createdAt'] as String,
  commentsEnabled: json['commentsEnabled'] as bool? ?? true,
  location: json['location'] == null
      ? null
      : PostLocationDto.fromJson(json['location'] as Map<String, dynamic>),
  title: json['title'] as String?,
  practice: json['practice'] == null
      ? null
      : PostPracticeDto.fromJson(json['practice'] as Map<String, dynamic>),
  video: json['video'] == null
      ? null
      : PostVideoDto.fromJson(json['video'] as Map<String, dynamic>),
  editedAt: json['editedAt'] as String?,
  promotionId: json['promotionId'] as String?,
);

Map<String, dynamic> _$PostDtoToJson(PostDto instance) => <String, dynamic>{
  'id': instance.id,
  'location': ?instance.location?.toJson(),
  'commentsEnabled': instance.commentsEnabled,
  'title': ?instance.title,
  'kind': instance.kind.toJson(),
  'practice': ?instance.practice?.toJson(),
  'contentClass': instance.contentClass.toJson(),
  'author': instance.author.toJson(),
  'body': instance.body,
  'media': instance.media.map((e) => e.toJson()).toList(),
  'attachments': instance.attachments.map((e) => e.toJson()).toList(),
  'video': ?instance.video?.toJson(),
  'tags': instance.tags,
  'mentions': instance.mentions.map((e) => e.toJson()).toList(),
  'status': instance.status.toJson(),
  'likeCount': instance.likeCount,
  'commentCount': instance.commentCount,
  'saveCount': instance.saveCount,
  'shareCount': instance.shareCount,
  'repostCount': instance.repostCount,
  'likedByMe': instance.likedByMe,
  'repostedByMe': instance.repostedByMe,
  'savedByMe': instance.savedByMe,
  'isMine': instance.isMine,
  'createdAt': instance.createdAt,
  'editedAt': ?instance.editedAt,
  'promotionId': ?instance.promotionId,
};
