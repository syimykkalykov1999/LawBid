// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'vote_poll_dto.g.dart';

@JsonSerializable()
class VotePollDto {
  const VotePollDto({required this.optionIds});

  factory VotePollDto.fromJson(Map<String, Object?> json) =>
      _$VotePollDtoFromJson(json);

  /// The chosen options (one unless the poll is multiple); an empty list retracts the vote.
  final List<String> optionIds;

  Map<String, Object?> toJson() => _$VotePollDtoToJson(this);
}
