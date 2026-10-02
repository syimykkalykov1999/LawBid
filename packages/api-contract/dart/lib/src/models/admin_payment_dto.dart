// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_billing_user_dto.dart';
import 'payment_status.dart';

part 'admin_payment_dto.g.dart';

@JsonSerializable()
class AdminPaymentDto {
  const AdminPaymentDto({
    required this.id,
    required this.userId,
    required this.user,
    required this.amountCents,
    required this.currency,
    required this.status,
    required this.paidAt,
    required this.failureCode,
    required this.stripeInvoiceId,
    required this.stripePaymentIntentId,
    required this.refundedCents,
    required this.refundableCents,
    required this.createdAt,
  });

  factory AdminPaymentDto.fromJson(Map<String, Object?> json) =>
      _$AdminPaymentDtoFromJson(json);

  final String id;
  final String userId;
  final AdminBillingUserDto? user;
  final int amountCents;
  final String currency;
  final PaymentStatus status;
  final DateTime? paidAt;
  final String? failureCode;
  final String? stripeInvoiceId;
  final String? stripePaymentIntentId;

  /// Refunds issued from the admin (pending + succeeded).
  final int refundedCents;
  final int refundableCents;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminPaymentDtoToJson(this);
}
