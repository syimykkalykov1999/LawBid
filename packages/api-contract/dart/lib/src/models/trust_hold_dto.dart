// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'trust_hold_dto.g.dart';

@JsonSerializable()
class TrustHoldDto {
  const TrustHoldDto({required this.payments, required this.bids, this.note});

  factory TrustHoldDto.fromJson(Map<String, Object?> json) =>
      _$TrustHoldDtoFromJson(json);

  final String? note;

  /// Pause / resume receiving payments.
  final bool payments;

  /// Pause / resume new bids.
  final bool bids;

  Map<String, Object?> toJson() => _$TrustHoldDtoToJson(this);
}
