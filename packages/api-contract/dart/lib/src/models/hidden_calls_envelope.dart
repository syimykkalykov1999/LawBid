// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hidden_calls_dto.dart';
import 'response_meta_dto.dart';

part 'hidden_calls_envelope.g.dart';

@JsonSerializable()
class HiddenCallsEnvelope {
  const HiddenCallsEnvelope({required this.data, this.meta});

  factory HiddenCallsEnvelope.fromJson(Map<String, Object?> json) =>
      _$HiddenCallsEnvelopeFromJson(json);

  final HiddenCallsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$HiddenCallsEnvelopeToJson(this);
}
