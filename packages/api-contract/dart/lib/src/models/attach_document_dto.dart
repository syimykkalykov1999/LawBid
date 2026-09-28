// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'attach_document_dto_side.dart';
import 'verification_doc_type.dart';

part 'attach_document_dto.g.dart';

@JsonSerializable()
class AttachDocumentDto {
  const AttachDocumentDto({
    required this.fileId,
    required this.docType,
    this.side,
    this.stateCode,
  });

  factory AttachDocumentDto.fromJson(Map<String, Object?> json) =>
      _$AttachDocumentDtoFromJson(json);

  /// A confirmed, clean upload.
  final String fileId;
  final VerificationDocType docType;

  /// Identity documents: front/back (back required for drivers_license and state_id).
  final AttachDocumentDtoSide? side;

  /// bar_license: the state of the license it proves.
  final String? stateCode;

  Map<String, Object?> toJson() => _$AttachDocumentDtoToJson(this);
}
