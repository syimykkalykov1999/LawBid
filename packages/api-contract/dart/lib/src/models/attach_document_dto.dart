// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'attach_document_dto_side.dart';
import 'selfie_capture_meta_dto.dart';
import 'verification_doc_type.dart';

part 'attach_document_dto.g.dart';

@JsonSerializable()
class AttachDocumentDto {
  const AttachDocumentDto({
    required this.fileId,
    required this.docType,
    this.side,
    this.stateCode,
    this.note,
    this.captureToken,
    this.captureMeta,
    this.handoffToken,
    this.biometricConsent,
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

  /// Owner 2026-10-18: the attorney's optional note to the reviewer, sent with the bar card of a number for manual review.
  final String? note;

  /// Selfie only: the one-time token from POST requests/{id}/selfie-capture (owner 2026-10-28). Required while verification.selfie_live_capture_required is on (default); missing / unknown / used / expired → 400 VALIDATION_ERROR with details.reason capture_token_missing / capture_token_invalid / capture_token_expired.
  final String? captureToken;
  final SelfieCaptureMetaDto? captureMeta;

  /// Selfie only, R-146: the code of POST verification/handoff when the phone opened the link from the computer. Must belong to this attorney and request (else 400 VALIDATION_ERROR, details.reason handoff_token_invalid / handoff_token_expired); the computer then reads `done`.
  final String? handoffToken;

  /// Selfie only, owner 2026-11-12 (row 52): the attorney ticked the biometric consent (automatic comparison of this selfie with the ID photo, version BIOMETRIC_CONSENT_VERSION). Stored with the time on the request; a selfie attached without it clears an earlier consent, and without consent no face comparison runs (a person compares).
  final bool? biometricConsent;

  Map<String, Object?> toJson() => _$AttachDocumentDtoToJson(this);
}
