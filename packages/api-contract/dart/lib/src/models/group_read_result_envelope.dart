// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_read_result_dto.dart';
import 'response_meta_dto.dart';

part 'group_read_result_envelope.g.dart';

@JsonSerializable()
class GroupReadResultEnvelope {
  const GroupReadResultEnvelope({required this.data, this.meta});

  factory GroupReadResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$GroupReadResultEnvelopeFromJson(json);

  final GroupReadResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$GroupReadResultEnvelopeToJson(this);
}
