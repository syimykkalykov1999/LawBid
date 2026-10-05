// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'refund_case_payment_dto.g.dart';

@JsonSerializable()
class RefundCasePaymentDto {
  const RefundCasePaymentDto({required this.reason, this.amountCents});

  factory RefundCasePaymentDto.fromJson(Map<String, Object?> json) =>
      _$RefundCasePaymentDtoFromJson(json);

  /// Part of the attorney fee to give back; default = all left.
  final int? amountCents;
  final String reason;

  Map<String, Object?> toJson() => _$RefundCasePaymentDtoToJson(this);
}
