// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fee_type.dart';
import 'start_availability.dart';

part 'bid_draft_body_dto.g.dart';

@JsonSerializable()
class BidDraftBodyDto {
  const BidDraftBodyDto({
    this.feeType,
    this.amountCents,
    this.message,
    this.startAvailability,
    this.startDate,
    this.estimatedDurationDays,
  });

  factory BidDraftBodyDto.fromJson(Map<String, Object?> json) =>
      _$BidDraftBodyDtoFromJson(json);

  final FeeType? feeType;
  final int? amountCents;
  final String? message;
  final StartAvailability? startAvailability;
  final DateTime? startDate;
  final int? estimatedDurationDays;

  Map<String, Object?> toJson() => _$BidDraftBodyDtoToJson(this);
}
