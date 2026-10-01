// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_review_appeal_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminReviewAppealDto _$AdminReviewAppealDtoFromJson(
  Map<String, dynamic> json,
) => AdminReviewAppealDto(
  id: json['id'] as String,
  status: ReviewAppealStatus.fromJson(json['status'] as String),
  reason: json['reason'] as String,
  createdAt: json['createdAt'] as String,
  autoRemoveAt: json['autoRemoveAt'] as String,
  reviewId: json['reviewId'] as String,
  rating: (json['rating'] as num).toInt(),
  authorName: json['authorName'] as String,
  authorRole: AdminReviewAppealDtoAuthorRole.fromJson(
    json['authorRole'] as String,
  ),
  clientId: json['clientId'] as String,
  clientName: json['clientName'] as String,
  body: json['body'] as String?,
);

Map<String, dynamic> _$AdminReviewAppealDtoToJson(
  AdminReviewAppealDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'status': instance.status.toJson(),
  'reason': instance.reason,
  'createdAt': instance.createdAt,
  'autoRemoveAt': instance.autoRemoveAt,
  'reviewId': instance.reviewId,
  'rating': instance.rating,
  'body': ?instance.body,
  'authorName': instance.authorName,
  'authorRole': instance.authorRole.toJson(),
  'clientId': instance.clientId,
  'clientName': instance.clientName,
};
