// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_billing_user_dto.dart';
import 'assistant_seat_change_status.dart';

part 'admin_seat_change_dto.g.dart';

@JsonSerializable()
class AdminSeatChangeDto {
  const AdminSeatChangeDto({
    required this.id,
    required this.userId,
    required this.user,
    required this.fromSeats,
    required this.toSeats,
    required this.amountCents,
    required this.currency,
    required this.status,
    required this.stripeInvoiceId,
    required this.invoiceUrl,
    required this.effectiveAt,
    required this.createdAt,
  });

  factory AdminSeatChangeDto.fromJson(Map<String, Object?> json) =>
      _$AdminSeatChangeDtoFromJson(json);

  final String id;
  final String userId;
  final AdminBillingUserDto? user;

  /// Extra seats before.
  final int fromSeats;

  /// Extra seats after.
  final int toSeats;

  /// Charged now (0 for a removal).
  final int amountCents;
  final String currency;
  final AssistantSeatChangeStatus status;
  final String? stripeInvoiceId;

  /// The invoice in the Stripe Dashboard (null for the fake).
  final String? invoiceUrl;

  /// A removal: when the seats go (the period end).
  final DateTime? effectiveAt;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminSeatChangeDtoToJson(this);
}
