// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_payment_refund_dto_initiated_by_type.dart';
import 'case_payment_refund_dto_status.dart';

part 'case_payment_refund_dto.g.dart';

@JsonSerializable()
class CasePaymentRefundDto {
  const CasePaymentRefundDto({
    required this.id,
    required this.paymentId,
    required this.amountCents,
    required this.reason,
    required this.initiatedByType,
    required this.status,
    required this.failureReason,
    required this.createdAt,
  });

  factory CasePaymentRefundDto.fromJson(Map<String, Object?> json) =>
      _$CasePaymentRefundDtoFromJson(json);

  final String id;
  final String paymentId;
  final int amountCents;
  final String reason;
  final CasePaymentRefundDtoInitiatedByType initiatedByType;
  final CasePaymentRefundDtoStatus status;
  final String? failureReason;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$CasePaymentRefundDtoToJson(this);
}
