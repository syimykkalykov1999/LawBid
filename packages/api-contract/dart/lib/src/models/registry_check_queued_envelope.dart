// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'registry_check_queued_dto.dart';
import 'response_meta_dto.dart';

part 'registry_check_queued_envelope.g.dart';

@JsonSerializable()
class RegistryCheckQueuedEnvelope {
  const RegistryCheckQueuedEnvelope({required this.data, this.meta});

  factory RegistryCheckQueuedEnvelope.fromJson(Map<String, Object?> json) =>
      _$RegistryCheckQueuedEnvelopeFromJson(json);

  final RegistryCheckQueuedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$RegistryCheckQueuedEnvelopeToJson(this);
}
