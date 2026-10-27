// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'team_view_dto.dart';

part 'team_view_envelope.g.dart';

@JsonSerializable()
class TeamViewEnvelope {
  const TeamViewEnvelope({required this.data, this.meta});

  factory TeamViewEnvelope.fromJson(Map<String, Object?> json) =>
      _$TeamViewEnvelopeFromJson(json);

  final TeamViewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$TeamViewEnvelopeToJson(this);
}
