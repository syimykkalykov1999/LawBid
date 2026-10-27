// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_verdict_body_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewVerdictBodyDto _$ReviewVerdictBodyDtoFromJson(
  Map<String, dynamic> json,
) => ReviewVerdictBodyDto(
  verdict: StaffReviewVerdict.fromJson(json['verdict'] as String),
  reasons: (json['reasons'] as List<dynamic>?)
      ?.map((e) => StaffReviewReason.fromJson(e as String))
      .toList(),
  note: json['note'] as String?,
);

Map<String, dynamic> _$ReviewVerdictBodyDtoToJson(
  ReviewVerdictBodyDto instance,
) => <String, dynamic>{
  'verdict': instance.verdict.toJson(),
  'reasons': ?instance.reasons?.map((e) => e.toJson()).toList(),
  'note': ?instance.note,
};
