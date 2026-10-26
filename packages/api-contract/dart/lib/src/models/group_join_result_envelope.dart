// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_join_result_dto.dart';
import 'response_meta_dto.dart';

part 'group_join_result_envelope.g.dart';

@JsonSerializable()
class GroupJoinResultEnvelope {
  const GroupJoinResultEnvelope({required this.data, this.meta});

  factory GroupJoinResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$GroupJoinResultEnvelopeFromJson(json);

  final GroupJoinResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$GroupJoinResultEnvelopeToJson(this);
}
