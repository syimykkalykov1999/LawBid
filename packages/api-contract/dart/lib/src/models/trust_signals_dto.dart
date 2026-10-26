// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'trust_signals_dto_license_confirmed_by.dart';
import 'trust_signals_dto_name_check.dart';

part 'trust_signals_dto.g.dart';

@JsonSerializable()
class TrustSignalsDto {
  const TrustSignalsDto({
    required this.selfAttested,
    required this.licenseConfirmed,
    required this.licenseConfirmedBy,
    required this.documentsVerified,
    required this.stripeKyc,
    required this.stripeIdentity,
    required this.identityConfirmed,
    required this.nameCheck,
    required this.firmLinkConfirmed,
  });

  factory TrustSignalsDto.fromJson(Map<String, Object?> json) =>
      _$TrustSignalsDtoFromJson(json);

  /// Sworn statement accepted, licenses verified.
  final bool selfAttested;

  /// The bar number was confirmed by the state registry or a verifier.
  final bool licenseConfirmed;
  final TrustSignalsDtoLicenseConfirmedBy? licenseConfirmedBy;

  /// A verifier checked bar card + ID + selfie.
  final bool documentsVerified;

  /// Stripe Connect KYC finished.
  final bool stripeKyc;

  /// Stripe KYC finished AND its legal name matches the profile / registry.
  final bool stripeIdentity;

  /// Documents verified or Stripe identity.
  final bool identityConfirmed;
  final TrustSignalsDtoNameCheck nameCheck;

  /// Company account: the link to the firm is shown.
  final bool firmLinkConfirmed;

  Map<String, Object?> toJson() => _$TrustSignalsDtoToJson(this);
}
