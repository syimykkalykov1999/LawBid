// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'team_release_result_dto.dart';

part 'team_release_result_envelope.g.dart';

@JsonSerializable()
class TeamReleaseResultEnvelope {
  const TeamReleaseResultEnvelope({required this.data, this.meta});

  factory TeamReleaseResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$TeamReleaseResultEnvelopeFromJson(json);

  final TeamReleaseResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$TeamReleaseResultEnvelopeToJson(this);
}
