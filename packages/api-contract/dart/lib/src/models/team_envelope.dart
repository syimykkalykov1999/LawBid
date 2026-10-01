// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'team_dto.dart';

part 'team_envelope.g.dart';

@JsonSerializable()
class TeamEnvelope {
  const TeamEnvelope({required this.data, this.meta});

  factory TeamEnvelope.fromJson(Map<String, Object?> json) =>
      _$TeamEnvelopeFromJson(json);

  final TeamDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$TeamEnvelopeToJson(this);
}
