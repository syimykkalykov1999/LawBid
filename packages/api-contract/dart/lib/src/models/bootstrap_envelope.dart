// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bootstrap_dto.dart';
import 'response_meta_dto.dart';

part 'bootstrap_envelope.g.dart';

@JsonSerializable()
class BootstrapEnvelope {
  const BootstrapEnvelope({required this.data, this.meta});

  factory BootstrapEnvelope.fromJson(Map<String, Object?> json) =>
      _$BootstrapEnvelopeFromJson(json);

  final BootstrapDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$BootstrapEnvelopeToJson(this);
}
