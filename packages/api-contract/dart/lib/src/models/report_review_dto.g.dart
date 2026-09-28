// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'report_review_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReportReviewDto _$ReportReviewDtoFromJson(Map<String, dynamic> json) =>
    ReportReviewDto(
      reason: ReportReason.fromJson(json['reason'] as String),
      note: json['note'] as String?,
    );

Map<String, dynamic> _$ReportReviewDtoToJson(ReportReviewDto instance) =>
    <String, dynamic>{
      'reason': instance.reason.toJson(),
      'note': ?instance.note,
    };
