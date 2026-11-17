// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hotline_end_dto.dart';
import 'response_meta_dto.dart';

part 'hotline_end_envelope.g.dart';

@JsonSerializable()
class HotlineEndEnvelope {
  const HotlineEndEnvelope({required this.data, this.meta});

  factory HotlineEndEnvelope.fromJson(Map<String, Object?> json) =>
      _$HotlineEndEnvelopeFromJson(json);

  final HotlineEndDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$HotlineEndEnvelopeToJson(this);
}
