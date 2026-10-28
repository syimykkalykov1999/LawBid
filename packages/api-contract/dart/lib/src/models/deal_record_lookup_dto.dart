// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'deal_record_dto.dart';

part 'deal_record_lookup_dto.g.dart';

@JsonSerializable()
class DealRecordLookupDto {
  const DealRecordLookupDto({required this.record});

  factory DealRecordLookupDto.fromJson(Map<String, Object?> json) =>
      _$DealRecordLookupDtoFromJson(json);

  final DealRecordDto? record;

  Map<String, Object?> toJson() => _$DealRecordLookupDtoToJson(this);
}
