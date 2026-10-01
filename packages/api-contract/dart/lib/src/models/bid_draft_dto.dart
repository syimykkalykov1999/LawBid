// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fee_type.dart';
import 'start_availability.dart';

part 'bid_draft_dto.g.dart';

@JsonSerializable()
class BidDraftDto {
  const BidDraftDto({
    required this.caseId,
    required this.updatedAt,
    this.feeType,
    this.amountCents,
    this.message,
    this.startAvailability,
    this.startDate,
    this.estimatedDurationDays,
    this.preparedBy,
  });

  factory BidDraftDto.fromJson(Map<String, Object?> json) =>
      _$BidDraftDtoFromJson(json);

  final FeeType? feeType;
  final int? amountCents;
  final String? message;
  final StartAvailability? startAvailability;
  final DateTime? startDate;
  final int? estimatedDurationDays;
  final String caseId;
  final String? preparedBy;
  final String updatedAt;

  Map<String, Object?> toJson() => _$BidDraftDtoToJson(this);
}
