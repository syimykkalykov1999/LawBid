// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'trust_holds_dto.g.dart';

@JsonSerializable()
class TrustHoldsDto {
  const TrustHoldsDto({
    required this.payments,
    required this.paymentsAt,
    required this.bids,
    required this.bidsAt,
    required this.note,
  });

  factory TrustHoldsDto.fromJson(Map<String, Object?> json) =>
      _$TrustHoldsDtoFromJson(json);

  final String? payments;
  final DateTime? paymentsAt;
  final String? bids;
  final DateTime? bidsAt;
  final String? note;

  Map<String, Object?> toJson() => _$TrustHoldsDtoToJson(this);
}
