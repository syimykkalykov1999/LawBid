// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'partner_client_rule.dart';
import 'partner_status.dart';

part 'update_partner_dto.g.dart';

@JsonSerializable()
class UpdatePartnerDto {
  const UpdatePartnerDto({
    this.reason = '',
    this.label,
    this.note,
    this.attorneyRateCents,
    this.clientRateCents,
    this.monthlyBaseCents,
    this.clientRule,
    this.holdDays,
    this.status,
    this.w9Received,
    this.demoAccess,
    this.externalName,
    this.externalContact,
  });

  factory UpdatePartnerDto.fromJson(Map<String, Object?> json) =>
      _$UpdatePartnerDtoFromJson(json);

  final String? label;
  final String? note;

  /// null = program default.
  final int? attorneyRateCents;
  final int? clientRateCents;
  final int? monthlyBaseCents;
  final PartnerClientRule? clientRule;
  final int? holdDays;
  final PartnerStatus? status;

  /// true = W-9 received now; false = clear it.
  final bool? w9Received;

  /// Owner 2026-10-05 («Продвижение»): may create demo accounts.
  final bool? demoAccess;
  final String? externalName;
  final String? externalContact;
  final String reason;

  Map<String, Object?> toJson() => _$UpdatePartnerDtoToJson(this);
}
