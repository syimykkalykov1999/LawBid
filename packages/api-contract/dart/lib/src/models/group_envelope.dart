// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_dto.dart';
import 'response_meta_dto.dart';

part 'group_envelope.g.dart';

@JsonSerializable()
class GroupEnvelope {
  const GroupEnvelope({required this.data, this.meta});

  factory GroupEnvelope.fromJson(Map<String, Object?> json) =>
      _$GroupEnvelopeFromJson(json);

  final GroupDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$GroupEnvelopeToJson(this);
}
