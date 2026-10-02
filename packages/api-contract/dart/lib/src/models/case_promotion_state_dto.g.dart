// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_promotion_state_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CasePromotionStateDto _$CasePromotionStateDtoFromJson(
  Map<String, dynamic> json,
) => CasePromotionStateDto(
  canPromote: json['canPromote'] as bool,
  quote: PromotionQuoteDto.fromJson(json['quote'] as Map<String, dynamic>),
  promotion: json['promotion'] == null
      ? null
      : CasePromotionDto.fromJson(json['promotion'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CasePromotionStateDtoToJson(
  CasePromotionStateDto instance,
) => <String, dynamic>{
  'promotion': ?instance.promotion?.toJson(),
  'canPromote': instance.canPromote,
  'quote': instance.quote.toJson(),
};
