// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_holiday_dto.dart';
import 'response_meta_dto.dart';

part 'admin_holiday_list_envelope.g.dart';

@JsonSerializable()
class AdminHolidayListEnvelope {
  const AdminHolidayListEnvelope({required this.data, this.meta});

  factory AdminHolidayListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminHolidayListEnvelopeFromJson(json);

  final List<AdminHolidayDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminHolidayListEnvelopeToJson(this);
}
