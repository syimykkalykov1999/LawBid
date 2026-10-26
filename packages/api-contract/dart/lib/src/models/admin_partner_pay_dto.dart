// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_partner_pay_dto.g.dart';

@JsonSerializable()
class AdminPartnerPayDto {
  const AdminPartnerPayDto({this.payoutRef, this.period, this.reason = ''});

  factory AdminPartnerPayDto.fromJson(Map<String, Object?> json) =>
      _$AdminPartnerPayDtoFromJson(json);

  final String reason;

  /// Transfer / payroll reference.
  final String? payoutRef;

  /// Only this period; default = everything approved.
  final String? period;

  Map<String, Object?> toJson() => _$AdminPartnerPayDtoToJson(this);
}
