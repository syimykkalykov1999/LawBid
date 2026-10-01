// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_review_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminReviewRowDto _$AdminReviewRowDtoFromJson(Map<String, dynamic> json) =>
    AdminReviewRowDto(
      id: json['id'] as String,
      rating: (json['rating'] as num).toInt(),
      attorneyName: json['attorneyName'] as String,
      clientName: json['clientName'] as String,
      caseTitle: json['caseTitle'] as String,
      status: AdminReviewRowDtoStatus.fromJson(json['status'] as String),
      createdAt: json['createdAt'] as String,
      body: json['body'] as String?,
    );

Map<String, dynamic> _$AdminReviewRowDtoToJson(AdminReviewRowDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'rating': instance.rating,
      'body': ?instance.body,
      'attorneyName': instance.attorneyName,
      'clientName': instance.clientName,
      'caseTitle': instance.caseTitle,
      'status': instance.status.toJson(),
      'createdAt': instance.createdAt,
    };
