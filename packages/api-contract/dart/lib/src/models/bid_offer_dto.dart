// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fee_type.dart';
import 'offer_status.dart';
import 'party_role.dart';
import 'payment_terms_dto.dart';

part 'bid_offer_dto.g.dart';

@JsonSerializable()
class BidOfferDto {
  const BidOfferDto({
    required this.id,
    required this.roundNo,
    required this.fromRole,
    required this.feeType,
    required this.amountCents,
    required this.message,
    required this.status,
    required this.createdAt,
    this.percentBps,
    this.paymentTerms,
  });

  factory BidOfferDto.fromJson(Map<String, Object?> json) =>
      _$BidOfferDtoFromJson(json);

  final String id;
  final int roundNo;
  final PartyRole fromRole;
  final FeeType feeType;
  final int amountCents;

  /// Owner 2026-10-17: contingency → basis points (3300 = 33 %).
  final int? percentBps;
  final String? message;

  /// Deal record 2026-10-27: rich payment terms of this round, if any.
  final PaymentTermsDto? paymentTerms;
  final OfferStatus status;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$BidOfferDtoToJson(this);
}
