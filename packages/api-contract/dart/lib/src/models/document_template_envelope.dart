// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'document_template_dto.dart';
import 'response_meta_dto.dart';

part 'document_template_envelope.g.dart';

@JsonSerializable()
class DocumentTemplateEnvelope {
  const DocumentTemplateEnvelope({required this.data, this.meta});

  factory DocumentTemplateEnvelope.fromJson(Map<String, Object?> json) =>
      _$DocumentTemplateEnvelopeFromJson(json);

  final DocumentTemplateDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DocumentTemplateEnvelopeToJson(this);
}
