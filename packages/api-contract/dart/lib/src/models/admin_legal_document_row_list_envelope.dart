// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_legal_document_row_dto.dart';
import 'response_meta_dto.dart';

part 'admin_legal_document_row_list_envelope.g.dart';

@JsonSerializable()
class AdminLegalDocumentRowListEnvelope {
  const AdminLegalDocumentRowListEnvelope({required this.data, this.meta});

  factory AdminLegalDocumentRowListEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$AdminLegalDocumentRowListEnvelopeFromJson(json);

  final List<AdminLegalDocumentRowDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminLegalDocumentRowListEnvelopeToJson(this);
}
