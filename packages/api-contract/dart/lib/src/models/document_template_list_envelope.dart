// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'document_template_dto.dart';
import 'response_meta_dto.dart';

part 'document_template_list_envelope.g.dart';

@JsonSerializable()
class DocumentTemplateListEnvelope {
  const DocumentTemplateListEnvelope({required this.data, this.meta});

  factory DocumentTemplateListEnvelope.fromJson(Map<String, Object?> json) =>
      _$DocumentTemplateListEnvelopeFromJson(json);

  final List<DocumentTemplateDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DocumentTemplateListEnvelopeToJson(this);
}
