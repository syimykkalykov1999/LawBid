// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'registry_test_result_dto.dart';
import 'response_meta_dto.dart';

part 'registry_test_result_envelope.g.dart';

@JsonSerializable()
class RegistryTestResultEnvelope {
  const RegistryTestResultEnvelope({required this.data, this.meta});

  factory RegistryTestResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$RegistryTestResultEnvelopeFromJson(json);

  final RegistryTestResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$RegistryTestResultEnvelopeToJson(this);
}
