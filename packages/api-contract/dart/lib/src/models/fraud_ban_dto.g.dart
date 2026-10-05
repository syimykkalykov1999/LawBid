// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fraud_ban_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FraudBanDto _$FraudBanDtoFromJson(Map<String, dynamic> json) => FraudBanDto(
  note: json['note'] as String,
  includeLinked: json['includeLinked'] as bool?,
);

Map<String, dynamic> _$FraudBanDtoToJson(FraudBanDto instance) =>
    <String, dynamic>{
      'note': instance.note,
      'includeLinked': ?instance.includeLinked,
    };
