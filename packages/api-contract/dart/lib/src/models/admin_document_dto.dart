// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_document_dto_side.dart';
import 'admin_selfie_capture_dto.dart';
import 'scan_status.dart';
import 'verification_doc_type.dart';

part 'admin_document_dto.g.dart';

@JsonSerializable()
class AdminDocumentDto {
  const AdminDocumentDto({
    required this.id,
    required this.docType,
    required this.side,
    required this.stateCode,
    required this.mime,
    required this.sizeBytes,
    required this.scanStatus,
    required this.notes,
    required this.capture,
    required this.createdAt,
  });

  factory AdminDocumentDto.fromJson(Map<String, Object?> json) =>
      _$AdminDocumentDtoFromJson(json);

  final String id;
  final VerificationDocType docType;
  final AdminDocumentDtoSide? side;
  final String? stateCode;
  final String mime;
  final int sizeBytes;
  final ScanStatus scanStatus;

  /// The attorney's note sent with this document.
  final String? notes;

  /// Selfie only (owner 2026-10-28): the guided camera report; null for other documents and selfies attached before it existed.
  final AdminSelfieCaptureDto? capture;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminDocumentDtoToJson(this);
}
