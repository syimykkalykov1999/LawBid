// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'legal_document_public_dto_doc_type.dart';
import 'legal_document_public_dto_locale.dart';

part 'legal_document_public_dto.g.dart';

@JsonSerializable()
class LegalDocumentPublicDto {
  const LegalDocumentPublicDto({
    required this.id,
    required this.docType,
    required this.locale,
    required this.version,
    required this.title,
    required this.publishedAt,
    required this.contentMd,
    required this.requiresReacceptance,
  });

  factory LegalDocumentPublicDto.fromJson(Map<String, Object?> json) =>
      _$LegalDocumentPublicDtoFromJson(json);

  final String id;
  final LegalDocumentPublicDtoDocType docType;
  final LegalDocumentPublicDtoLocale locale;
  final String version;
  final String title;
  final DateTime? publishedAt;

  /// Markdown.
  final String contentMd;

  /// Users who accepted an older version were asked to accept this one again.
  final bool requiresReacceptance;

  Map<String, Object?> toJson() => _$LegalDocumentPublicDtoToJson(this);
}
