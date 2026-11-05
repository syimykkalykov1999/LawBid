// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bid_case_change_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BidCaseChangeDto _$BidCaseChangeDtoFromJson(Map<String, dynamic> json) =>
    BidCaseChangeDto(
      field: json['field'] as String,
      oldValue: json['oldValue'] as String?,
      newValue: json['newValue'] as String?,
      at: DateTime.parse(json['at'] as String),
    );

Map<String, dynamic> _$BidCaseChangeDtoToJson(BidCaseChangeDto instance) =>
    <String, dynamic>{
      'field': instance.field,
      'oldValue': ?instance.oldValue,
      'newValue': ?instance.newValue,
      'at': instance.at.toIso8601String(),
    };
