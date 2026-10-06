// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_dmca_notice_detail_dto.dart';
import 'response_meta_dto.dart';

part 'admin_dmca_notice_detail_envelope.g.dart';

@JsonSerializable()
class AdminDmcaNoticeDetailEnvelope {
  const AdminDmcaNoticeDetailEnvelope({required this.data, this.meta});

  factory AdminDmcaNoticeDetailEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminDmcaNoticeDetailEnvelopeFromJson(json);

  final AdminDmcaNoticeDetailDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminDmcaNoticeDetailEnvelopeToJson(this);
}
