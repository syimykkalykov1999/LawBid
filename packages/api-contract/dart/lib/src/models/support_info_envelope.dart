// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'support_info_dto.dart';

part 'support_info_envelope.g.dart';

@JsonSerializable()
class SupportInfoEnvelope {
  const SupportInfoEnvelope({required this.data, this.meta});

  factory SupportInfoEnvelope.fromJson(Map<String, Object?> json) =>
      _$SupportInfoEnvelopeFromJson(json);

  final SupportInfoDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SupportInfoEnvelopeToJson(this);
}
