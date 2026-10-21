// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'start_call_vote_dto.g.dart';

@JsonSerializable()
class StartCallVoteDto {
  const StartCallVoteDto({required this.targetId});

  factory StartCallVoteDto.fromJson(Map<String, Object?> json) =>
      _$StartCallVoteDtoFromJson(json);

  final String targetId;

  Map<String, Object?> toJson() => _$StartCallVoteDtoToJson(this);
}
