// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_ai_hint_dto.dart';

part 'staff_ai_hint_envelope.g.dart';

@JsonSerializable()
class StaffAiHintEnvelope {
  const StaffAiHintEnvelope({required this.data, this.meta});

  factory StaffAiHintEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffAiHintEnvelopeFromJson(json);

  final StaffAiHintDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffAiHintEnvelopeToJson(this);
}
