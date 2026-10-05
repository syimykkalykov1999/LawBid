// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_dmca_notice_row_dto.dart';
import 'response_meta_dto.dart';

part 'admin_dmca_notice_row_list_envelope.g.dart';

@JsonSerializable()
class AdminDmcaNoticeRowListEnvelope {
  const AdminDmcaNoticeRowListEnvelope({required this.data, this.meta});

  factory AdminDmcaNoticeRowListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminDmcaNoticeRowListEnvelopeFromJson(json);

  final List<AdminDmcaNoticeRowDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminDmcaNoticeRowListEnvelopeToJson(this);
}
