// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'boost_billing.dart';

part 'boost_offer_dto.g.dart';

@JsonSerializable()
class BoostOfferDto {
  const BoostOfferDto({required this.billing, required this.priceCents});

  factory BoostOfferDto.fromJson(Map<String, Object?> json) =>
      _$BoostOfferDtoFromJson(json);

  final BoostBilling billing;

  /// Per 1000 for impressions / reach, per one otherwise.
  final int priceCents;

  Map<String, Object?> toJson() => _$BoostOfferDtoToJson(this);
}
