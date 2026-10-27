// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_settings_dto.dart';

part 'staff_settings_envelope.g.dart';

@JsonSerializable()
class StaffSettingsEnvelope {
  const StaffSettingsEnvelope({required this.data, this.meta});

  factory StaffSettingsEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffSettingsEnvelopeFromJson(json);

  final StaffSettingsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffSettingsEnvelopeToJson(this);
}
