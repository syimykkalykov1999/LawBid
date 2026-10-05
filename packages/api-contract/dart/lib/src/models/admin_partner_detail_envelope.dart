// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_partner_detail_dto.dart';
import 'response_meta_dto.dart';

part 'admin_partner_detail_envelope.g.dart';

@JsonSerializable()
class AdminPartnerDetailEnvelope {
  const AdminPartnerDetailEnvelope({required this.data, this.meta});

  factory AdminPartnerDetailEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminPartnerDetailEnvelopeFromJson(json);

  final AdminPartnerDetailDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminPartnerDetailEnvelopeToJson(this);
}
