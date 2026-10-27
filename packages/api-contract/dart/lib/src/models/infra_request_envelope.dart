// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'infra_request_dto.dart';
import 'response_meta_dto.dart';

part 'infra_request_envelope.g.dart';

@JsonSerializable()
class InfraRequestEnvelope {
  const InfraRequestEnvelope({required this.data, this.meta});

  factory InfraRequestEnvelope.fromJson(Map<String, Object?> json) =>
      _$InfraRequestEnvelopeFromJson(json);

  final InfraRequestDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$InfraRequestEnvelopeToJson(this);
}
