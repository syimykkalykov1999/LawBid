// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_document_template_dto.dart';
import 'response_meta_dto.dart';

part 'admin_document_template_envelope.g.dart';

@JsonSerializable()
class AdminDocumentTemplateEnvelope {
  const AdminDocumentTemplateEnvelope({required this.data, this.meta});

  factory AdminDocumentTemplateEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminDocumentTemplateEnvelopeFromJson(json);

  final AdminDocumentTemplateDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminDocumentTemplateEnvelopeToJson(this);
}
