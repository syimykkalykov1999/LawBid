// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_e2ee_dto.dart';
import 'response_meta_dto.dart';

part 'group_e2ee_envelope.g.dart';

@JsonSerializable()
class GroupE2eeEnvelope {
  const GroupE2eeEnvelope({required this.data, this.meta});

  factory GroupE2eeEnvelope.fromJson(Map<String, Object?> json) =>
      _$GroupE2eeEnvelopeFromJson(json);

  final GroupE2eeDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$GroupE2eeEnvelopeToJson(this);
}
