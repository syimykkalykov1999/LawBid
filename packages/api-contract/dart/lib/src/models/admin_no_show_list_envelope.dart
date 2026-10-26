// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_no_show_dto.dart';
import 'response_meta_dto.dart';

part 'admin_no_show_list_envelope.g.dart';

@JsonSerializable()
class AdminNoShowListEnvelope {
  const AdminNoShowListEnvelope({required this.data, this.meta});

  factory AdminNoShowListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminNoShowListEnvelopeFromJson(json);

  final List<AdminNoShowDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminNoShowListEnvelopeToJson(this);
}
