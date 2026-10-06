// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'legal_document_brief_dto_doc_type.dart';
import 'legal_document_brief_dto_locale.dart';

part 'legal_document_brief_dto.g.dart';

@JsonSerializable()
class LegalDocumentBriefDto {
  const LegalDocumentBriefDto({
    required this.id,
    required this.docType,
    required this.locale,
    required this.version,
    required this.title,
    required this.publishedAt,
  });

  factory LegalDocumentBriefDto.fromJson(Map<String, Object?> json) =>
      _$LegalDocumentBriefDtoFromJson(json);

  final String id;
  final LegalDocumentBriefDtoDocType docType;
  final LegalDocumentBriefDtoLocale locale;
  final String version;
  final String title;
  final DateTime? publishedAt;

  Map<String, Object?> toJson() => _$LegalDocumentBriefDtoToJson(this);
}
