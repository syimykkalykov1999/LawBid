// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'deal_attorney_dto.dart';
import 'deal_case_dto.dart';
import 'deal_offer_dto.dart';
import 'deal_party_dto.dart';
import 'deal_record_status.dart';
import 'deal_signature_dto.dart';
import 'deal_terms_dto.dart';
import 'party_role.dart';

part 'deal_record_dto.g.dart';

@JsonSerializable()
class DealRecordDto {
  const DealRecordDto({
    required this.id,
    required this.caseId,
    required this.bidId,
    required this.status,
    required this.acceptedBy,
    required this.myRole,
    required this.myTurnToSign,
    required this.recordCode,
    required this.snapshotSha256,
    required this.sealedSha256,
    required this.textVersion,
    required this.acceptedAt,
    required this.caseValue,
    required this.client,
    required this.attorney,
    required this.terms,
    required this.history,
    required this.notContractText,
    required this.footerText,
    required this.signatures,
    required this.unsignedUrl,
    required this.sealedUrl,
    required this.sealedFileId,
    required this.unsignedFileId,
    required this.agreementFileId,
    required this.agreementUrl,
    required this.declineReason,
    required this.failedReason,
    required this.createdAt,
    required this.sealedAt,
    required this.declinedAt,
  });

  factory DealRecordDto.fromJson(Map<String, Object?> json) =>
      _$DealRecordDtoFromJson(json);

  final String id;
  final String caseId;
  final String bidId;
  final DealRecordStatus status;

  /// Who tapped Accept (signs first).
  final PartyRole acceptedBy;

  /// The caller's side.
  final PartyRole myRole;

  /// True while the caller may draw their signature now.
  final bool myTurnToSign;

  /// <8 of id>-<8 of SHA-256>, printed on every page.
  final String recordCode;

  /// SHA-256 of the canonical snapshot.
  final String snapshotSha256;

  /// SHA-256 of the sealed PDF.
  final String? sealedSha256;

  /// Version of the admin texts the record was created with.
  final int textVersion;
  final DateTime acceptedAt;

  /// The name has been replaced because it contains a keyword. Original name: `case`.
  @JsonKey(name: 'case')
  final DealCaseDto caseValue;
  final DealPartyDto client;
  final DealAttorneyDto attorney;
  final DealTermsDto terms;
  final List<DealOfferDto> history;

  /// The fixed line under the title (English).
  final String notContractText;

  /// The footer of every page (English).
  final String footerText;
  final List<DealSignatureDto> signatures;
  final String? unsignedUrl;
  final String? sealedUrl;
  final String? sealedFileId;
  final String? unsignedFileId;
  final String? agreementFileId;
  final String? agreementUrl;
  final String? declineReason;
  final String? failedReason;
  final DateTime createdAt;
  final DateTime? sealedAt;
  final DateTime? declinedAt;

  Map<String, Object?> toJson() => _$DealRecordDtoToJson(this);
}
