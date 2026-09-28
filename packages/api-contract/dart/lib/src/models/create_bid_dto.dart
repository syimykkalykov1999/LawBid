// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fee_type.dart';
import 'start_availability.dart';

part 'create_bid_dto.g.dart';

@JsonSerializable()
class CreateBidDto {
  const CreateBidDto({
    required this.feeType,
    required this.message,
    required this.startAvailability,
    this.amountCents,
    this.startDate,
    this.estimatedDurationDays,
  });

  factory CreateBidDto.fromJson(Map<String, Object?> json) =>
      _$CreateBidDtoFromJson(json);

  final FeeType feeType;

  /// Required for fixed/hourly; ignored (stored as 0) for free_consultation.
  final int? amountCents;
  final String message;
  final StartAvailability startAvailability;

  /// Required when startAvailability = custom_date; not past.
  final DateTime? startDate;
  final int? estimatedDurationDays;

  Map<String, Object?> toJson() => _$CreateBidDtoToJson(this);
}
