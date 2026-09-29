// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'legal_document_admin_dto_doc_type.dart';

part 'legal_document_admin_dto.g.dart';

@JsonSerializable()
class LegalDocumentAdminDto {
  const LegalDocumentAdminDto({
    required this.id,
    required this.docType,
    required this.locale,
    required this.version,
    required this.isCurrent,
    required this.publishedAt,
    required this.contentUrl,
    required this.contentMd,
    required this.consents,
    required this.createdAt,
  });

  factory LegalDocumentAdminDto.fromJson(Map<String, Object?> json) =>
      _$LegalDocumentAdminDtoFromJson(json);

  final String id;
  final LegalDocumentAdminDtoDocType docType;
  final String locale;
  final String version;
  final bool isCurrent;
  final DateTime? publishedAt;
  final String? contentUrl;

  /// Markdown; full text in the detail call.
  final String? contentMd;

  /// Consents recorded against this version.
  final int consents;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$LegalDocumentAdminDtoToJson(this);
}
