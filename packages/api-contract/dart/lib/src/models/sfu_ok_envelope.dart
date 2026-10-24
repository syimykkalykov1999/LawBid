// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'sfu_ok_dto.dart';

part 'sfu_ok_envelope.g.dart';

@JsonSerializable()
class SfuOkEnvelope {
  const SfuOkEnvelope({required this.data, this.meta});

  factory SfuOkEnvelope.fromJson(Map<String, Object?> json) =>
      _$SfuOkEnvelopeFromJson(json);

  final SfuOkDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SfuOkEnvelopeToJson(this);
}
