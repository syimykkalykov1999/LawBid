// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_partner_commission_row_dto.dart';
import 'response_meta_dto.dart';

part 'admin_partner_commission_row_envelope.g.dart';

@JsonSerializable()
class AdminPartnerCommissionRowEnvelope {
  const AdminPartnerCommissionRowEnvelope({required this.data, this.meta});

  factory AdminPartnerCommissionRowEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$AdminPartnerCommissionRowEnvelopeFromJson(json);

  final AdminPartnerCommissionRowDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminPartnerCommissionRowEnvelopeToJson(this);
}
