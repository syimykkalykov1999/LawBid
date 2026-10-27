// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_verdict_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewVerdictResultDto _$ReviewVerdictResultDtoFromJson(
  Map<String, dynamic> json,
) => ReviewVerdictResultDto(
  ok: json['ok'] as bool,
  result: StaffReviewVerdictOutcome.fromJson(json['result'] as String),
);

Map<String, dynamic> _$ReviewVerdictResultDtoToJson(
  ReviewVerdictResultDto instance,
) => <String, dynamic>{'ok': instance.ok, 'result': instance.result.toJson()};
