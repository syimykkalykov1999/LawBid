// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'legal_export_dto.dart';
import 'response_meta_dto.dart';

part 'legal_export_list_envelope.g.dart';

@JsonSerializable()
class LegalExportListEnvelope {
  const LegalExportListEnvelope({required this.data, this.meta});

  factory LegalExportListEnvelope.fromJson(Map<String, Object?> json) =>
      _$LegalExportListEnvelopeFromJson(json);

  final List<LegalExportDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$LegalExportListEnvelopeToJson(this);
}
