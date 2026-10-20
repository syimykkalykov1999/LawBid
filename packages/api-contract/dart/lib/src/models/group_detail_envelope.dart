// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_detail_dto.dart';
import 'response_meta_dto.dart';

part 'group_detail_envelope.g.dart';

@JsonSerializable()
class GroupDetailEnvelope {
  const GroupDetailEnvelope({required this.data, this.meta});

  factory GroupDetailEnvelope.fromJson(Map<String, Object?> json) =>
      _$GroupDetailEnvelopeFromJson(json);

  final GroupDetailDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$GroupDetailEnvelopeToJson(this);
}
