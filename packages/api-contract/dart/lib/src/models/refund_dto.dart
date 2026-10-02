// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_billing_user_dto.dart';
import 'refund_dto_status.dart';

part 'refund_dto.g.dart';

@JsonSerializable()
class RefundDto {
  const RefundDto({
    required this.id,
    required this.paymentId,
    required this.userId,
    required this.user,
    required this.amountCents,
    required this.reason,
    required this.status,
    required this.stripeRefundId,
    required this.failureReason,
    required this.adminId,
    required this.createdAt,
  });

  factory RefundDto.fromJson(Map<String, Object?> json) =>
      _$RefundDtoFromJson(json);

  final String id;
  final String paymentId;
  final String userId;
  final AdminBillingUserDto? user;
  final int amountCents;
  final String reason;
  final RefundDtoStatus status;
  final String? stripeRefundId;
  final String? failureReason;
  final String adminId;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$RefundDtoToJson(this);
}
