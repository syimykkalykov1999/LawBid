// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewReportDto _$ReviewReportDtoFromJson(Map<String, dynamic> json) =>
    ReviewReportDto(
      id: json['id'] as String,
      reviewId: json['reviewId'] as String,
      reason: ReportReason.fromJson(json['reason'] as String),
      status: ReportStatus.fromJson(json['status'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$ReviewReportDtoToJson(ReviewReportDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'reviewId': instance.reviewId,
      'reason': instance.reason.toJson(),
      'status': instance.status.toJson(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
