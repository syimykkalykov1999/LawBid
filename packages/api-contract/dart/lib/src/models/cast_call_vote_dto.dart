// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'cast_call_vote_dto.g.dart';

@JsonSerializable()
class CastCallVoteDto {
  const CastCallVoteDto({required this.favor});

  factory CastCallVoteDto.fromJson(Map<String, Object?> json) =>
      _$CastCallVoteDtoFromJson(json);

  /// true = for removing, false = against.
  final bool favor;

  Map<String, Object?> toJson() => _$CastCallVoteDtoToJson(this);
}
