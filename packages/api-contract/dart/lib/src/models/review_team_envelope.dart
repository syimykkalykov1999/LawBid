// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'review_team_dto.dart';

part 'review_team_envelope.g.dart';

@JsonSerializable()
class ReviewTeamEnvelope {
  const ReviewTeamEnvelope({required this.data, this.meta});

  factory ReviewTeamEnvelope.fromJson(Map<String, Object?> json) =>
      _$ReviewTeamEnvelopeFromJson(json);

  final ReviewTeamDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ReviewTeamEnvelopeToJson(this);
}
