// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'treasury_cost_line_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TreasuryCostLineDto _$TreasuryCostLineDtoFromJson(Map<String, dynamic> json) =>
    TreasuryCostLineDto(
      key: TreasuryCostLineDtoKey.fromJson(json['key'] as String),
      monthlyCents: (json['monthlyCents'] as num).toInt(),
      via: TreasuryCostLineDtoVia.fromJson(json['via'] as String),
    );

Map<String, dynamic> _$TreasuryCostLineDtoToJson(
  TreasuryCostLineDto instance,
) => <String, dynamic>{
  'key': instance.key.toJson(),
  'monthlyCents': instance.monthlyCents,
  'via': instance.via.toJson(),
};
