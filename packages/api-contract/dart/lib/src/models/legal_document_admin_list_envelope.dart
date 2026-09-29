// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'legal_document_admin_dto.dart';
import 'response_meta_dto.dart';

part 'legal_document_admin_list_envelope.g.dart';

@JsonSerializable()
class LegalDocumentAdminListEnvelope {
  const LegalDocumentAdminListEnvelope({required this.data, this.meta});

  factory LegalDocumentAdminListEnvelope.fromJson(Map<String, Object?> json) =>
      _$LegalDocumentAdminListEnvelopeFromJson(json);

  final List<LegalDocumentAdminDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$LegalDocumentAdminListEnvelopeToJson(this);
}
