// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_hold_list_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustHoldListItemDto _$TrustHoldListItemDtoFromJson(
  Map<String, dynamic> json,
) => TrustHoldListItemDto(
  attorney: AdminTrustAttorneyDto.fromJson(
    json['attorney'] as Map<String, dynamic>,
  ),
  level: (json['level'] as num).toInt(),
  holds: TrustHoldsDto.fromJson(json['holds'] as Map<String, dynamic>),
  complaintsTotal: (json['complaintsTotal'] as num).toInt(),
  heldSince: DateTime.parse(json['heldSince'] as String),
);

Map<String, dynamic> _$TrustHoldListItemDtoToJson(
  TrustHoldListItemDto instance,
) => <String, dynamic>{
  'attorney': instance.attorney.toJson(),
  'level': instance.level,
  'holds': instance.holds.toJson(),
  'complaintsTotal': instance.complaintsTotal,
  'heldSince': instance.heldSince.toIso8601String(),
};
