// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostDto _$PostDtoFromJson(Map<String, dynamic> json) => PostDto(
  mentions: (json['mentions'] as List<dynamic>)
      .map((e) => MentionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  createdAt: json['createdAt'] as String,
  savedByMe: json['savedByMe'] as bool,
  repostedByMe: json['repostedByMe'] as bool,
  likedByMe: json['likedByMe'] as bool,
  body: json['body'] as String,
  repostCount: (json['repostCount'] as num).toInt(),
  kind: PostKind.fromJson(json['kind'] as String),
  viewCount: (json['viewCount'] as num).toInt(),
  contentClass: PostContentClass.fromJson(json['contentClass'] as String),
  author: PostAuthorDto.fromJson(json['author'] as Map<String, dynamic>),
  id: json['id'] as String,
  media: (json['media'] as List<dynamic>)
      .map((e) => PostMediaDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  attachments: (json['attachments'] as List<dynamic>)
      .map((e) => PostAttachmentDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  saveCount: (json['saveCount'] as num).toInt(),
  tags: (json['tags'] as List<dynamic>).map((e) => e as String).toList(),
  shareCount: (json['shareCount'] as num).toInt(),
  status: ContentStatus.fromJson(json['status'] as String),
  likeCount: (json['likeCount'] as num).toInt(),
  commentCount: (json['commentCount'] as num).toInt(),
  isMine: json['isMine'] as bool,
  likesHidden: json['likesHidden'] as bool? ?? false,
  commentsEnabled: json['commentsEnabled'] as bool? ?? true,
  viewsHidden: json['viewsHidden'] as bool? ?? false,
  promotionCta: json['promotionCta'] == null
      ? null
      : PostPromotionCtaDto.fromJson(
          json['promotionCta'] as Map<String, dynamic>,
        ),
  practice: json['practice'] == null
      ? null
      : PostPracticeDto.fromJson(json['practice'] as Map<String, dynamic>),
  title: json['title'] as String?,
  archivedAt: json['archivedAt'] == null
      ? null
      : DateTime.parse(json['archivedAt'] as String),
  repostedBy: json['repostedBy'] == null
      ? null
      : PostReposterDto.fromJson(json['repostedBy'] as Map<String, dynamic>),
  location: json['location'] == null
      ? null
      : PostLocationDto.fromJson(json['location'] as Map<String, dynamic>),
  editedAt: json['editedAt'] as String?,
  pinSlot: (json['pinSlot'] as num?)?.toInt(),
  promotionId: json['promotionId'] as String?,
  video: json['video'] == null
      ? null
      : PostVideoDto.fromJson(json['video'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PostDtoToJson(PostDto instance) => <String, dynamic>{
  'id': instance.id,
  'location': ?instance.location?.toJson(),
  'commentsEnabled': instance.commentsEnabled,
  'archivedAt': ?instance.archivedAt?.toIso8601String(),
  'likesHidden': instance.likesHidden,
  'viewsHidden': instance.viewsHidden,
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
  'viewCount': instance.viewCount,
  'repostCount': instance.repostCount,
  'likedByMe': instance.likedByMe,
  'repostedByMe': instance.repostedByMe,
  'repostedBy': ?instance.repostedBy?.toJson(),
  'savedByMe': instance.savedByMe,
  'isMine': instance.isMine,
  'createdAt': instance.createdAt,
  'editedAt': ?instance.editedAt,
  'pinSlot': ?instance.pinSlot,
  'promotionId': ?instance.promotionId,
  'promotionCta': ?instance.promotionCta?.toJson(),
};
