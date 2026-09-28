// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'own_verification_document_dto_side.dart';
import 'verification_doc_type.dart';

part 'own_verification_document_dto.g.dart';

@JsonSerializable()
class OwnVerificationDocumentDto {
  const OwnVerificationDocumentDto({
    required this.id,
    required this.docType,
    required this.side,
    required this.stateCode,
    required this.fileId,
    required this.createdAt,
  });

  factory OwnVerificationDocumentDto.fromJson(Map<String, Object?> json) =>
      _$OwnVerificationDocumentDtoFromJson(json);

  final String id;
  final VerificationDocType docType;
  final OwnVerificationDocumentDtoSide? side;
  final String? stateCode;
  final String fileId;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$OwnVerificationDocumentDtoToJson(this);
}
