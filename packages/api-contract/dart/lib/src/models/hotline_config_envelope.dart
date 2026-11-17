// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hotline_config_dto.dart';
import 'response_meta_dto.dart';

part 'hotline_config_envelope.g.dart';

@JsonSerializable()
class HotlineConfigEnvelope {
  const HotlineConfigEnvelope({required this.data, this.meta});

  factory HotlineConfigEnvelope.fromJson(Map<String, Object?> json) =>
      _$HotlineConfigEnvelopeFromJson(json);

  final HotlineConfigDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$HotlineConfigEnvelopeToJson(this);
}
