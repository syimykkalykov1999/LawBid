// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_partner_pay_result_dto.g.dart';

@JsonSerializable()
class AdminPartnerPayResultDto {
  const AdminPartnerPayResultDto({
    required this.count,
    required this.totalCents,
  });

  factory AdminPartnerPayResultDto.fromJson(Map<String, Object?> json) =>
      _$AdminPartnerPayResultDtoFromJson(json);

  final int count;
  final int totalCents;

  Map<String, Object?> toJson() => _$AdminPartnerPayResultDtoToJson(this);
}
