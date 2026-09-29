// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

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

  Map<String, Object?> toJson() => _$PaymentDtoToJson(this);
}
