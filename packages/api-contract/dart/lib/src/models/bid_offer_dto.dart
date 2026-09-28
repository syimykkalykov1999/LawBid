// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fee_type.dart';
import 'offer_status.dart';
import 'party_role.dart';

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
  });

  factory BidOfferDto.fromJson(Map<String, Object?> json) =>
      _$BidOfferDtoFromJson(json);

  final String id;
  final int roundNo;
  final PartyRole fromRole;
  final FeeType feeType;
  final int amountCents;
  final String? message;
  final OfferStatus status;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$BidOfferDtoToJson(this);
}
