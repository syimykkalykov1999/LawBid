// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'history_accepted_bid_dto.g.dart';

@JsonSerializable()
class HistoryAcceptedBidDto {
  const HistoryAcceptedBidDto({
    required this.amountCents,
    required this.feeType,
  });

  factory HistoryAcceptedBidDto.fromJson(Map<String, Object?> json) =>
      _$HistoryAcceptedBidDtoFromJson(json);

  /// Final amount in cents.
  final num amountCents;
  final String feeType;

  Map<String, Object?> toJson() => _$HistoryAcceptedBidDtoToJson(this);
}
