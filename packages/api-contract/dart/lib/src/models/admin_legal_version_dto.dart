// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_legal_version_dto_doc_type.dart';
import 'admin_legal_version_dto_locale.dart';
import 'admin_legal_version_dto_status.dart';

part 'admin_legal_version_dto.g.dart';

@JsonSerializable()
class AdminLegalVersionDto {
  const AdminLegalVersionDto({
    required this.id,
    required this.docType,
    required this.locale,
    required this.version,
    required this.status,
    required this.isCurrent,
    required this.requiresReacceptance,
    required this.publishedAt,
    required this.updatedAt,
    required this.changeNote,
    required this.changedBy,
    required this.changedByName,
    required this.rollbackOfId,
    required this.consents,
    required this.length,
    required this.contentMd,
  });

  factory AdminLegalVersionDto.fromJson(Map<String, Object?> json) =>
      _$AdminLegalVersionDtoFromJson(json);

  final String id;
  final AdminLegalVersionDtoDocType docType;
  final AdminLegalVersionDtoLocale locale;

  /// `draft` for the draft, else 2026-10-05.1
  final String version;
  final AdminLegalVersionDtoStatus status;
  final bool isCurrent;
  final bool requiresReacceptance;
  final DateTime? publishedAt;
  final DateTime updatedAt;
  final String? changeNote;
  final String? changedBy;
  final String? changedByName;
  final String? rollbackOfId;

  /// Consents recorded against this version.
  final num consents;
  final int length;

  /// Markdown; only in the detail calls.
  final String? contentMd;

  Map<String, Object?> toJson() => _$AdminLegalVersionDtoToJson(this);
}
