// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promo_delete_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromoDeleteResultDto _$PromoDeleteResultDtoFromJson(
  Map<String, dynamic> json,
) => PromoDeleteResultDto(
  id: json['id'] as String,
  outcome: PromoDeleteOutcome.fromJson(json['outcome'] as String),
);

Map<String, dynamic> _$PromoDeleteResultDtoToJson(
  PromoDeleteResultDto instance,
) => <String, dynamic>{'id': instance.id, 'outcome': instance.outcome.toJson()};
