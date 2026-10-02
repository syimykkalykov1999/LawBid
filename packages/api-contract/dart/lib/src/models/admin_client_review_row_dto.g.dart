// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_client_review_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminClientReviewRowDto _$AdminClientReviewRowDtoFromJson(
  Map<String, dynamic> json,
) => AdminClientReviewRowDto(
  id: json['id'] as String,
  rating: (json['rating'] as num).toInt(),
  authorId: json['authorId'] as String,
  authorName: json['authorName'] as String,
  authorRole: AdminClientReviewRowDtoAuthorRole.fromJson(
    json['authorRole'] as String,
  ),
  clientId: json['clientId'] as String,
  clientName: json['clientName'] as String,
  status: AdminClientReviewRowDtoStatus.fromJson(json['status'] as String),
  createdAt: json['createdAt'] as String,
  body: json['body'] as String?,
  caseTitle: json['caseTitle'] as String?,
  appealStatus: json['appealStatus'] == null
      ? null
      : AdminClientReviewRowDtoAppealStatus.fromJson(
          json['appealStatus'] as String,
        ),
);

Map<String, dynamic> _$AdminClientReviewRowDtoToJson(
  AdminClientReviewRowDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'rating': instance.rating,
  'body': ?instance.body,
  'authorId': instance.authorId,
  'authorName': instance.authorName,
  'authorRole': instance.authorRole.toJson(),
  'clientId': instance.clientId,
  'clientName': instance.clientName,
  'caseTitle': ?instance.caseTitle,
  'status': instance.status.toJson(),
  'appealStatus': ?instance.appealStatus?.toJson(),
  'createdAt': instance.createdAt,
};
