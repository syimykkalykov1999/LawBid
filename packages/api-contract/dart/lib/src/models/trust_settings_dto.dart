// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'trust_settings_dto.g.dart';

@JsonSerializable()
class TrustSettingsDto {
  const TrustSettingsDto({
    required this.enabled,
    required this.manualReview,
    required this.requireRegistry,
    required this.requireIdentity,
    required this.requireDocuments,
    required this.bidsRequireCleared,
    required this.payoutDelayDays,
    required this.autoHoldOnComplaint,
    required this.complaintsToSuspend,
    required this.complaintWindowDays,
    required this.autoHoldOnNameMismatch,
    required this.flagDuplicateClaims,
    required this.firmLinkAutoRegistry,
    required this.firmLinkAutoEmail,
  });

  factory TrustSettingsDto.fromJson(Map<String, Object?> json) =>
      _$TrustSettingsDtoFromJson(json);

  /// Master switch. Off = self-attested attorneys get the badge and payments at once; no holds, no queue.
  final bool enabled;

  /// Staff review. Off = automatic checks only; the documents requirement is ignored and the queue is paused, not lost.
  final bool manualReview;

  /// Require the bar number to match the state registry (or staff).
  final bool requireRegistry;

  /// Require Stripe KYC with the attorney as the verified person (or a firm link).
  final bool requireIdentity;

  /// Require staff-checked ID + selfie + bar card.
  final bool requireDocuments;

  /// Bids too wait until the attorney is cleared.
  final bool bidsRequireCleared;
  final int payoutDelayDays;
  final bool autoHoldOnComplaint;
  final int complaintsToSuspend;
  final int complaintWindowDays;
  final bool autoHoldOnNameMismatch;
  final bool flagDuplicateClaims;

  /// Firm link counts when the registry firm equals the Stripe company.
  final bool firmLinkAutoRegistry;

  /// Firm link counts after a code to an e-mail on the firm domain.
  final bool firmLinkAutoEmail;

  Map<String, Object?> toJson() => _$TrustSettingsDtoToJson(this);
}
