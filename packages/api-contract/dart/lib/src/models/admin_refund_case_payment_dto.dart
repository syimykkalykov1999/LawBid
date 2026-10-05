// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_refund_case_payment_dto.g.dart';

@JsonSerializable()
class AdminRefundCasePaymentDto {
  const AdminRefundCasePaymentDto({required this.reason, this.amountCents});

  factory AdminRefundCasePaymentDto.fromJson(Map<String, Object?> json) =>
      _$AdminRefundCasePaymentDtoFromJson(json);

  /// Part of the attorney fee to give back; default = all left.
  final int? amountCents;
  final String reason;

  Map<String, Object?> toJson() => _$AdminRefundCasePaymentDtoToJson(this);
}
