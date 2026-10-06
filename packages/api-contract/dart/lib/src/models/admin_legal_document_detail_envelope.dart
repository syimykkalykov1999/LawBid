// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_legal_document_detail_dto.dart';
import 'response_meta_dto.dart';

part 'admin_legal_document_detail_envelope.g.dart';

@JsonSerializable()
class AdminLegalDocumentDetailEnvelope {
  const AdminLegalDocumentDetailEnvelope({required this.data, this.meta});

  factory AdminLegalDocumentDetailEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$AdminLegalDocumentDetailEnvelopeFromJson(json);

  final AdminLegalDocumentDetailDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminLegalDocumentDetailEnvelopeToJson(this);
}
