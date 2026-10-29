// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_person_dto.dart';

part 'poll_voter_option_dto.g.dart';

@JsonSerializable()
class PollVoterOptionDto {
  const PollVoterOptionDto({
    required this.optionId,
    required this.voters,
  });
  
  factory PollVoterOptionDto.fromJson(Map<String, Object?> json) => _$PollVoterOptionDtoFromJson(json);
  
  final String optionId;
  final List<GroupPersonDto> voters;

  Map<String, Object?> toJson() => _$PollVoterOptionDtoToJson(this);
}
