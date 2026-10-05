// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'my_case_payments_summary_dto.g.dart';

@JsonSerializable()
class MyCasePaymentsSummaryDto {
  const MyCasePaymentsSummaryDto({
    required this.totalCents,
    required this.count,
    required this.refundedCents,
  });

  factory MyCasePaymentsSummaryDto.fromJson(Map<String, Object?> json) =>
      _$MyCasePaymentsSummaryDtoFromJson(json);

  /// Succeeded, this year.
  final int totalCents;
  final int count;
  final int refundedCents;

  Map<String, Object?> toJson() => _$MyCasePaymentsSummaryDtoToJson(this);
}
