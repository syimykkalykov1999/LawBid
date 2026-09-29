// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'legal_document_admin_dto.dart';
import 'response_meta_dto.dart';

part 'legal_document_admin_envelope.g.dart';

@JsonSerializable()
class LegalDocumentAdminEnvelope {
  const LegalDocumentAdminEnvelope({required this.data, this.meta});

  factory LegalDocumentAdminEnvelope.fromJson(Map<String, Object?> json) =>
      _$LegalDocumentAdminEnvelopeFromJson(json);

  final LegalDocumentAdminDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$LegalDocumentAdminEnvelopeToJson(this);
}
