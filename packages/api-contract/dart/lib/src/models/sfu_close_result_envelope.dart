// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'sfu_close_result_dto.dart';

part 'sfu_close_result_envelope.g.dart';

@JsonSerializable()
class SfuCloseResultEnvelope {
  const SfuCloseResultEnvelope({required this.data, this.meta});

  factory SfuCloseResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$SfuCloseResultEnvelopeFromJson(json);

  final SfuCloseResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SfuCloseResultEnvelopeToJson(this);
}
