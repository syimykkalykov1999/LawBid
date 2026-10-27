// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_recommendation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffRecommendationDto _$StaffRecommendationDtoFromJson(
  Map<String, dynamic> json,
) => StaffRecommendationDto(
  advice: StaffRecommendationDtoAdvice.fromJson(json['advice'] as String),
  adviceLabel: json['adviceLabel'] as String,
  actionLabel: json['actionLabel'] as String,
  headline: json['headline'] as String,
  lines: (json['lines'] as List<dynamic>).map((e) => e as String).toList(),
);

Map<String, dynamic> _$StaffRecommendationDtoToJson(
  StaffRecommendationDto instance,
) => <String, dynamic>{
  'advice': instance.advice.toJson(),
  'adviceLabel': instance.adviceLabel,
  'actionLabel': instance.actionLabel,
  'headline': instance.headline,
  'lines': instance.lines,
};
