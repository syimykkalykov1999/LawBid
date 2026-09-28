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
  caseId: json['caseId'] as String,
  attorneyId: json['attorneyId'] as String,
  status: ReviewStatus.fromJson(json['status'] as String),
  editableUntil: DateTime.parse(json['editableUntil'] as String),
);

Map<String, dynamic> _$ReviewDtoToJson(ReviewDto instance) => <String, dynamic>{
  'id': instance.id,
  'rating': instance.rating,
  'body': ?instance.body,
  'authorDisplayName': ?instance.authorDisplayName,
  'createdAt': instance.createdAt.toIso8601String(),
  'editedAt': ?instance.editedAt?.toIso8601String(),
  'caseId': instance.caseId,
  'attorneyId': instance.attorneyId,
  'status': instance.status.toJson(),
  'editableUntil': instance.editableUntil.toIso8601String(),
};
