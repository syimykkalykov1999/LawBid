// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'custom_integration_created_dto.dart';
import 'response_meta_dto.dart';

part 'custom_integration_created_envelope.g.dart';

@JsonSerializable()
class CustomIntegrationCreatedEnvelope {
  const CustomIntegrationCreatedEnvelope({required this.data, this.meta});

  factory CustomIntegrationCreatedEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$CustomIntegrationCreatedEnvelopeFromJson(json);

  final CustomIntegrationCreatedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$CustomIntegrationCreatedEnvelopeToJson(this);
}
