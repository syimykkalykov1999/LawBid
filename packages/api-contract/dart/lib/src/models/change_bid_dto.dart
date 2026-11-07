// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fee_type.dart';
import 'payment_terms_dto.dart';

part 'change_bid_dto.g.dart';

@JsonSerializable()
class ChangeBidDto {
  const ChangeBidDto({
    required this.feeType,
    this.paymentTerms,
    this.amountCents,
    this.percentBps,
    this.message,
  });

  factory ChangeBidDto.fromJson(Map<String, Object?> json) =>
      _$ChangeBidDtoFromJson(json);

  /// Deal record 2026-10-27: the rich payment terms of this round (replaces the previous round's); only while `bids.rich_terms_enabled`.
  final PaymentTermsDto? paymentTerms;

  /// Required unless the bid is contingency.
  final int? amountCents;

  /// Owner 2026-10-17: required for a contingency bid.
  final int? percentBps;
  final String? message;
  final FeeType feeType;

  Map<String, Object?> toJson() => _$ChangeBidDtoToJson(this);
}
