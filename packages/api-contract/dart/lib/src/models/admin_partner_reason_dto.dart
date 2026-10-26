// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_partner_reason_dto.g.dart';

@JsonSerializable()
class AdminPartnerReasonDto {
  const AdminPartnerReasonDto({this.reason = ''});

  factory AdminPartnerReasonDto.fromJson(Map<String, Object?> json) =>
      _$AdminPartnerReasonDtoFromJson(json);

  final String reason;

  Map<String, Object?> toJson() => _$AdminPartnerReasonDtoToJson(this);
}
