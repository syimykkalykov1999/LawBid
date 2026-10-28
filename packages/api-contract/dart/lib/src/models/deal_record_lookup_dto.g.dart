// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'deal_record_lookup_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DealRecordLookupDto _$DealRecordLookupDtoFromJson(Map<String, dynamic> json) =>
    DealRecordLookupDto(
      record: json['record'] == null
          ? null
          : DealRecordDto.fromJson(json['record'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$DealRecordLookupDtoToJson(
  DealRecordLookupDto instance,
) => <String, dynamic>{'record': ?instance.record?.toJson()};
