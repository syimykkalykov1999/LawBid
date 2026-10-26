// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'block_bar_number_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BlockBarNumberDto _$BlockBarNumberDtoFromJson(Map<String, dynamic> json) =>
    BlockBarNumberDto(
      stateCode: json['stateCode'] as String,
      barNumber: json['barNumber'] as String,
      reason: json['reason'] as String,
      blockContacts: json['blockContacts'] as bool?,
    );

Map<String, dynamic> _$BlockBarNumberDtoToJson(BlockBarNumberDto instance) =>
    <String, dynamic>{
      'stateCode': instance.stateCode,
      'barNumber': instance.barNumber,
      'reason': instance.reason,
      'blockContacts': ?instance.blockContacts,
    };
