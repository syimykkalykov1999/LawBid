// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'partner_commission_dto.dart';
import 'partner_rates_dto.dart';
import 'partner_referred_user_dto.dart';
import 'partner_status.dart';
import 'partner_texts_dto.dart';
import 'partner_totals_dto.dart';

part 'partner_me_dto.g.dart';

@JsonSerializable()
class PartnerMeDto {
  const PartnerMeDto({
    required this.isPartner,
    required this.code,
    required this.shareUrl,
    required this.rates,
    required this.totals,
    required this.referred,
    required this.commissions,
    required this.texts,
    this.status,
  });

  factory PartnerMeDto.fromJson(Map<String, Object?> json) =>
      _$PartnerMeDtoFromJson(json);

  /// False for everyone who is not a partner.
  final bool isPartner;
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

  /// Owner's words in the user's language.
  final PartnerTextsDto texts;

  Map<String, Object?> toJson() => _$PartnerMeDtoToJson(this);
}
