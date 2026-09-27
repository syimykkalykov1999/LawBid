// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'legal_doc_type.dart';

part 'bootstrap_legal_document_dto.g.dart';

@JsonSerializable()
class BootstrapLegalDocumentDto {
  const BootstrapLegalDocumentDto({
    required this.id,
    required this.docType,
    required this.version,
    required this.locale,
    required this.contentUrl,
    required this.contentMd,
    required this.publishedAt,
  });

  factory BootstrapLegalDocumentDto.fromJson(Map<String, Object?> json) =>
      _$BootstrapLegalDocumentDtoFromJson(json);

  /// Send as `documentId` with POST /users/me/consents.
  final String id;
  @JsonKey(name: 'doc_type')
  final LegalDocType docType;
  final String version;
  final String locale;
  @JsonKey(name: 'content_url')
  final String? contentUrl;
  @JsonKey(name: 'content_md')
  final String? contentMd;
  @JsonKey(name: 'published_at')
  final DateTime? publishedAt;

  Map<String, Object?> toJson() => _$BootstrapLegalDocumentDtoToJson(this);
}
