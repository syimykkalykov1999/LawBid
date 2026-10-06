// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_audience_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionAudienceDto _$PromotionAudienceDtoFromJson(
  Map<String, dynamic> json,
) => PromotionAudienceDto(
  states: (json['states'] as List<dynamic>).map((e) => e as String).toList(),
  countries: (json['countries'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  topics: (json['topics'] as List<dynamic>).map((e) => e as String).toList(),
  role: json['role'] == null
      ? PromotionAudienceDtoRole.all
      : PromotionAudienceDtoRole.fromJson(json['role'] as String),
);

Map<String, dynamic> _$PromotionAudienceDtoToJson(
  PromotionAudienceDto instance,
) => <String, dynamic>{
  'role': instance.role.toJson(),
  'states': instance.states,
  'countries': instance.countries,
  'topics': instance.topics,
};
