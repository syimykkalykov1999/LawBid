// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'legal_download_dto.dart';
import 'response_meta_dto.dart';

part 'legal_download_envelope.g.dart';

@JsonSerializable()
class LegalDownloadEnvelope {
  const LegalDownloadEnvelope({required this.data, this.meta});

  factory LegalDownloadEnvelope.fromJson(Map<String, Object?> json) =>
      _$LegalDownloadEnvelopeFromJson(json);

  final LegalDownloadDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$LegalDownloadEnvelopeToJson(this);
}
