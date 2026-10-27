// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'heavy_hitters_dto.dart';
import 'response_meta_dto.dart';

part 'heavy_hitters_envelope.g.dart';

@JsonSerializable()
class HeavyHittersEnvelope {
  const HeavyHittersEnvelope({required this.data, this.meta});

  factory HeavyHittersEnvelope.fromJson(Map<String, Object?> json) =>
      _$HeavyHittersEnvelopeFromJson(json);

  final HeavyHittersDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$HeavyHittersEnvelopeToJson(this);
}
