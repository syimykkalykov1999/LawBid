// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'block_result_dto.dart';
import 'response_meta_dto.dart';

part 'block_result_envelope.g.dart';

@JsonSerializable()
class BlockResultEnvelope {
  const BlockResultEnvelope({required this.data, this.meta});

  factory BlockResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$BlockResultEnvelopeFromJson(json);

  final BlockResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$BlockResultEnvelopeToJson(this);
}
