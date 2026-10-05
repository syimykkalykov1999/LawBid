// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'payroll_stripe_link_dto.g.dart';

@JsonSerializable()
class PayrollStripeLinkDto {
  const PayrollStripeLinkDto({required this.url, required this.payoutsEnabled});

  factory PayrollStripeLinkDto.fromJson(Map<String, Object?> json) =>
      _$PayrollStripeLinkDtoFromJson(json);

  /// Stripe page where the person links a bank account or debit card (send it to them).
  final String url;
  final bool payoutsEnabled;

  Map<String, Object?> toJson() => _$PayrollStripeLinkDtoToJson(this);
}
