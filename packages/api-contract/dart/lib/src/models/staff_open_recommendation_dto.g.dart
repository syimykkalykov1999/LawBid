// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_open_recommendation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffOpenRecommendationDto _$StaffOpenRecommendationDtoFromJson(
  Map<String, dynamic> json,
) => StaffOpenRecommendationDto(
  suggestionId: json['suggestionId'] as String,
  kind: json['kind'] as String,
  recommendation: StaffRecommendationDto.fromJson(
    json['recommendation'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$StaffOpenRecommendationDtoToJson(
  StaffOpenRecommendationDto instance,
) => <String, dynamic>{
  'suggestionId': instance.suggestionId,
  'kind': instance.kind,
  'recommendation': instance.recommendation.toJson(),
};
