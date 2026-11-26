// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'mls_welcome_dto.dart';
import 'response_meta_dto.dart';

part 'mls_welcome_list_envelope.g.dart';

@JsonSerializable()
class MlsWelcomeListEnvelope {
  const MlsWelcomeListEnvelope({required this.data, this.meta});

  factory MlsWelcomeListEnvelope.fromJson(Map<String, Object?> json) =>
      _$MlsWelcomeListEnvelopeFromJson(json);

  final List<MlsWelcomeDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MlsWelcomeListEnvelopeToJson(this);
}
