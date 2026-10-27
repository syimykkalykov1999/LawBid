// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_watermark_dto.dart';

part 'staff_watermark_envelope.g.dart';

@JsonSerializable()
class StaffWatermarkEnvelope {
  const StaffWatermarkEnvelope({required this.data, this.meta});

  factory StaffWatermarkEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffWatermarkEnvelopeFromJson(json);

  final StaffWatermarkDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffWatermarkEnvelopeToJson(this);
}
