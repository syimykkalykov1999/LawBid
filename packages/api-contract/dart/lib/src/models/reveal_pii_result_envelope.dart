// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'reveal_pii_result_dto.dart';

part 'reveal_pii_result_envelope.g.dart';

@JsonSerializable()
class RevealPiiResultEnvelope {
  const RevealPiiResultEnvelope({required this.data, this.meta});

  factory RevealPiiResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$RevealPiiResultEnvelopeFromJson(json);

  final RevealPiiResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$RevealPiiResultEnvelopeToJson(this);
}
