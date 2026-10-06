// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'partner_commission_dto.dart';
import 'partner_join_mode.dart';
import 'partner_me_texts_dto.dart';
import 'partner_rates_dto.dart';
import 'partner_referred_user_dto.dart';
import 'partner_status.dart';
import 'partner_totals_dto.dart';

part 'partner_me_dto.g.dart';

@JsonSerializable()
class PartnerMeDto {
  const PartnerMeDto({
    required this.enabled,
    required this.isPartner,
    required this.canJoin,
    required this.joinMode,
    required this.code,
    required this.shareUrl,
    required this.rates,
    required this.totals,
    required this.referred,
    required this.commissions,
    required this.texts,
    required this.termsVersion,
    required this.w9Required,
    required this.w9Received,
    this.status,
    this.termsAcceptedVersion,
  });

  factory PartnerMeDto.fromJson(Map<String, Object?> json) =>
      _$PartnerMeDtoFromJson(json);

  /// Program switched on by the owner. Off: the app hides the section.
  final bool enabled;

  /// False for everyone who is not a partner.
  final bool isPartner;

  /// The user may ask to become a partner right now (program on, joining not closed, not a partner yet).
  final bool canJoin;

  /// open: the link at once; approval: the admin confirms first.
  final PartnerJoinMode joinMode;
  final PartnerStatus? status;

  /// Referral code (same as the referral screen).
  final String code;
  final String shareUrl;
  final PartnerRatesDto rates;
  final PartnerTotalsDto totals;

  /// Newest first, up to 200.
  final List<PartnerReferredUserDto> referred;

  /// Newest first, up to 200.
  final List<PartnerCommissionDto> commissions;

  /// Owner's words, the disclosure and the rules in the user's language.
  final PartnerMeTextsDto texts;

  /// Current version of the partner rules.
  final String termsVersion;

  /// Version the partner accepted; null = not accepted yet (the app shows the rules with an Accept button, POST /partners/me/accept-terms).
  final String? termsAcceptedVersion;

  /// A W-9 (or W-8) is needed before the first payout.
  final bool w9Required;

  /// The admin marked the W-9 as received.
  final bool w9Received;

  Map<String, Object?> toJson() => _$PartnerMeDtoToJson(this);
}
