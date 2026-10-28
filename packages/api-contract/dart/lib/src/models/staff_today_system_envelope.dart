// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_today_system_dto.dart';

part 'staff_today_system_envelope.g.dart';

@JsonSerializable()
class StaffTodaySystemEnvelope {
  const StaffTodaySystemEnvelope({required this.data, this.meta});

  factory StaffTodaySystemEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffTodaySystemEnvelopeFromJson(json);

  final StaffTodaySystemDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffTodaySystemEnvelopeToJson(this);
}
