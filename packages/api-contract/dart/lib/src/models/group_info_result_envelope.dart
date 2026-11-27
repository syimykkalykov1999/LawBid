// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_info_result_dto.dart';
import 'response_meta_dto.dart';

part 'group_info_result_envelope.g.dart';

@JsonSerializable()
class GroupInfoResultEnvelope {
  const GroupInfoResultEnvelope({required this.data, this.meta});

  factory GroupInfoResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$GroupInfoResultEnvelopeFromJson(json);

  final GroupInfoResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$GroupInfoResultEnvelopeToJson(this);
}
