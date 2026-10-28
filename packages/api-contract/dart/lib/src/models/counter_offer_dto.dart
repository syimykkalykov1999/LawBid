// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payment_terms_dto.dart';

part 'counter_offer_dto.g.dart';

@JsonSerializable()
class CounterOfferDto {
  const CounterOfferDto({
    this.paymentTerms,
    this.amountCents,
    this.percentBps,
    this.message,
  });

  factory CounterOfferDto.fromJson(Map<String, Object?> json) =>
      _$CounterOfferDtoFromJson(json);

  /// Deal record 2026-10-27: the rich payment terms of this round (replaces the previous round's); only while `bids.rich_terms_enabled`.
  final PaymentTermsDto? paymentTerms;

  /// Required unless the bid is contingency.
  final int? amountCents;

  /// Owner 2026-10-17: required for a contingency bid.
  final int? percentBps;
  final String? message;

  Map<String, Object?> toJson() => _$CounterOfferDtoToJson(this);
}
