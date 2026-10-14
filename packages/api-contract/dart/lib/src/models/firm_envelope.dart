// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'firm_dto.dart';
import 'response_meta_dto.dart';

part 'firm_envelope.g.dart';

@JsonSerializable()
class FirmEnvelope {
  const FirmEnvelope({required this.data, this.meta});

  factory FirmEnvelope.fromJson(Map<String, Object?> json) =>
      _$FirmEnvelopeFromJson(json);

  final FirmDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$FirmEnvelopeToJson(this);
}
