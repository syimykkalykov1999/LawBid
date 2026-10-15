// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payment_dto_kind.dart';
import 'payment_dto_status.dart';

part 'payment_dto.g.dart';

@JsonSerializable()
class PaymentDto {
  const PaymentDto({
    required this.id,
    required this.amountCents,
    required this.currency,
    required this.status,
    required this.paidAt,
    required this.failureCode,
    required this.createdAt,
    required this.kind,
    this.boostTarget,
    this.boostDays,
  });

  factory PaymentDto.fromJson(Map<String, Object?> json) =>
      _$PaymentDtoFromJson(json);

  final String id;
  final int amountCents;
  final String currency;
  final PaymentDtoStatus status;
  final DateTime? paidAt;
  final String? failureCode;
  final DateTime createdAt;

  /// Owner 2026-10-15: what it paid for.
  final PaymentDtoKind kind;

  /// For a boost: what was boosted (`post` | `case`) and for how many days.
  final String? boostTarget;
  final int? boostDays;

  Map<String, Object?> toJson() => _$PaymentDtoToJson(this);
}
