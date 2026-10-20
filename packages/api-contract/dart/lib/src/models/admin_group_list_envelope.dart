// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_group_dto.dart';
import 'response_meta_dto.dart';

part 'admin_group_list_envelope.g.dart';

@JsonSerializable()
class AdminGroupListEnvelope {
  const AdminGroupListEnvelope({required this.data, this.meta});

  factory AdminGroupListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminGroupListEnvelopeFromJson(json);

  final List<AdminGroupDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminGroupListEnvelopeToJson(this);
}
