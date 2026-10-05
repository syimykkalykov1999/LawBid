// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_hold_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustHoldDto _$TrustHoldDtoFromJson(Map<String, dynamic> json) => TrustHoldDto(
  payments: json['payments'] as bool,
  bids: json['bids'] as bool,
  note: json['note'] as String?,
);

Map<String, dynamic> _$TrustHoldDtoToJson(TrustHoldDto instance) =>
    <String, dynamic>{
      'note': ?instance.note,
      'payments': instance.payments,
      'bids': instance.bids,
    };
