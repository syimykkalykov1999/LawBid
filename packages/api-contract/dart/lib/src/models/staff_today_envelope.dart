// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_today_dto.dart';

part 'staff_today_envelope.g.dart';

@JsonSerializable()
class StaffTodayEnvelope {
  const StaffTodayEnvelope({required this.data, this.meta});

  factory StaffTodayEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffTodayEnvelopeFromJson(json);

  final StaffTodayDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffTodayEnvelopeToJson(this);
}
