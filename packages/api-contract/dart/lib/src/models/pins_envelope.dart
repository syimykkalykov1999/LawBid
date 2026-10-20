// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'pins_dto.dart';
import 'response_meta_dto.dart';

part 'pins_envelope.g.dart';

@JsonSerializable()
class PinsEnvelope {
  const PinsEnvelope({required this.data, this.meta});

  factory PinsEnvelope.fromJson(Map<String, Object?> json) =>
      _$PinsEnvelopeFromJson(json);

  final PinsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PinsEnvelopeToJson(this);
}
