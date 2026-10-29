// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_person_dto.dart';

part 'poll_option_dto.g.dart';

@JsonSerializable()
class PollOptionDto {
  const PollOptionDto({
    required this.id,
    required this.text,
    required this.votes,
    required this.percent,
    required this.voted,
    required this.recentVoters,
  });
  
  factory PollOptionDto.fromJson(Map<String, Object?> json) => _$PollOptionDtoFromJson(json);
  
  final String id;
  final String text;

  /// People who chose this option.
  final num votes;

  /// votes / voters, 0–100 (rounded; several answers can sum >100).
  final num percent;

  /// I chose this option.
  final bool voted;

  /// A few recent voters — open polls only, empty when anonymous.
  final List<GroupPersonDto> recentVoters;

  Map<String, Object?> toJson() => _$PollOptionDtoToJson(this);
}
