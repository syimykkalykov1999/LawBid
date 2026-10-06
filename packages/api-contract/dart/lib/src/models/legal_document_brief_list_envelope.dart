// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'legal_document_brief_dto.dart';
import 'response_meta_dto.dart';

part 'legal_document_brief_list_envelope.g.dart';

@JsonSerializable()
class LegalDocumentBriefListEnvelope {
  const LegalDocumentBriefListEnvelope({required this.data, this.meta});

  factory LegalDocumentBriefListEnvelope.fromJson(Map<String, Object?> json) =>
      _$LegalDocumentBriefListEnvelopeFromJson(json);

  final List<LegalDocumentBriefDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$LegalDocumentBriefListEnvelopeToJson(this);
}
