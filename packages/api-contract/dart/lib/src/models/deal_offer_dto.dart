// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fee_type.dart';
import 'party_role.dart';
import 'payment_terms_dto.dart';

part 'deal_offer_dto.g.dart';

@JsonSerializable()
class DealOfferDto {
  const DealOfferDto({
    required this.feeType,
    required this.amountCents,
    required this.percentBps,
    required this.roundNo,
    required this.fromRole,
    required this.createdAt,
    required this.message,
    required this.status,
    this.paymentTerms,
  });

  factory DealOfferDto.fromJson(Map<String, Object?> json) =>
      _$DealOfferDtoFromJson(json);

  final FeeType feeType;
  final int amountCents;
  final int? percentBps;
  final PaymentTermsDto? paymentTerms;
  final int roundNo;
  final PartyRole fromRole;
  final DateTime createdAt;
  final String? message;
  final String status;

  Map<String, Object?> toJson() => _$DealOfferDtoToJson(this);
}
