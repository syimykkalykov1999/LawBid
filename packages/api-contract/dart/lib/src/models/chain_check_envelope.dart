// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'chain_check_dto.dart';
import 'response_meta_dto.dart';

part 'chain_check_envelope.g.dart';

@JsonSerializable()
class ChainCheckEnvelope {
  const ChainCheckEnvelope({required this.data, this.meta});

  factory ChainCheckEnvelope.fromJson(Map<String, Object?> json) =>
      _$ChainCheckEnvelopeFromJson(json);

  final ChainCheckDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ChainCheckEnvelopeToJson(this);
}
