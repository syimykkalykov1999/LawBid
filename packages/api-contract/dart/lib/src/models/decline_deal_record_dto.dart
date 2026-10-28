// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'decline_deal_record_dto.g.dart';

@JsonSerializable()
class DeclineDealRecordDto {
  const DeclineDealRecordDto({this.reason});

  factory DeclineDealRecordDto.fromJson(Map<String, Object?> json) =>
      _$DeclineDealRecordDtoFromJson(json);

  final String? reason;

  Map<String, Object?> toJson() => _$DeclineDealRecordDtoToJson(this);
}
