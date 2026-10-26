// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'partner_client_rule.dart';

part 'create_partner_dto.g.dart';

@JsonSerializable()
class CreatePartnerDto {
  const CreatePartnerDto({
    this.reason = '',
    this.label,
    this.note,
    this.attorneyRateCents,
    this.clientRateCents,
    this.monthlyBaseCents,
    this.clientRule,
    this.holdDays,
    this.userId,
    this.externalName,
    this.externalContact,
    this.code,
  });

  factory CreatePartnerDto.fromJson(Map<String, Object?> json) =>
      _$CreatePartnerDtoFromJson(json);

  final String? label;
  final String? note;

  /// null = program default.
  final int? attorneyRateCents;
  final int? clientRateCents;
  final int? monthlyBaseCents;
  final PartnerClientRule? clientRule;
  final int? holdDays;

  /// An existing user account. Leave out and give externalName for a blogger without an account.
  final String? userId;

  /// Owner 2026-10-05: partner without an app account (blogger).
  final String? externalName;

  /// Instagram, phone, e-mail…
  final String? externalContact;

  /// Own word as the referral code (4–24 letters/digits); default = keep/generate.
  final String? code;
  final String reason;

  Map<String, Object?> toJson() => _$CreatePartnerDtoToJson(this);
}
