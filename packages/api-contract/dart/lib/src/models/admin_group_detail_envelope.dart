// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_group_detail_dto.dart';
import 'response_meta_dto.dart';

part 'admin_group_detail_envelope.g.dart';

@JsonSerializable()
class AdminGroupDetailEnvelope {
  const AdminGroupDetailEnvelope({required this.data, this.meta});

  factory AdminGroupDetailEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminGroupDetailEnvelopeFromJson(json);

  final AdminGroupDetailDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminGroupDetailEnvelopeToJson(this);
}
