// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewDto _$ReviewDtoFromJson(Map<String, dynamic> json) => ReviewDto(
  id: json['id'] as String,
  rating: (json['rating'] as num).toInt(),
  body: json['body'] as String?,
  authorDisplayName: json['authorDisplayName'] as String?,
  createdAt: DateTime.parse(json['createdAt'] as String),
  editedAt: json['editedAt'] == null
      ? null
      : DateTime.parse(json['editedAt'] as String),
  fromCase: json['fromCase'] as bool,
  authorRole: ReviewAuthorRole.fromJson(json['authorRole'] as String),
  reply: json['reply'] as String?,
  replyAt: json['replyAt'] == null
      ? null
      : DateTime.parse(json['replyAt'] as String),
  helpfulCount: (json['helpfulCount'] as num).toInt(),
  helpfulByMe: json['helpfulByMe'] as bool,
  isMine: json['isMine'] as bool,
  caseId: json['caseId'] as String?,
  attorneyId: json['attorneyId'] as String,
  status: ReviewStatus.fromJson(json['status'] as String),
  editableUntil: DateTime.parse(json['editableUntil'] as String),
  editable: json['editable'] as bool,
);

Map<String, dynamic> _$ReviewDtoToJson(ReviewDto instance) => <String, dynamic>{
  'id': instance.id,
  'rating': instance.rating,
  'body': ?instance.body,
  'authorDisplayName': ?instance.authorDisplayName,
  'createdAt': instance.createdAt.toIso8601String(),
  'editedAt': ?instance.editedAt?.toIso8601String(),
  'fromCase': instance.fromCase,
  'authorRole': instance.authorRole.toJson(),
  'reply': ?instance.reply,
  'replyAt': ?instance.replyAt?.toIso8601String(),
  'helpfulCount': instance.helpfulCount,
  'helpfulByMe': instance.helpfulByMe,
  'isMine': instance.isMine,
  'caseId': ?instance.caseId,
  'attorneyId': instance.attorneyId,
  'status': instance.status.toJson(),
  'editableUntil': instance.editableUntil.toIso8601String(),
  'editable': instance.editable,
};
