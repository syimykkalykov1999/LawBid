// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'poll_option_dto.dart';

part 'poll_dto.g.dart';

@JsonSerializable()
class PollDto {
  const PollDto({
    required this.id,
    required this.question,
    required this.multiple,
    required this.anonymous,
    required this.closed,
    required this.creatorId,
    required this.totalVoters,
    required this.options,
    required this.myOptionIds,
    this.closedAt,
  });
  
  factory PollDto.fromJson(Map<String, Object?> json) => _$PollDtoFromJson(json);
  
  final String id;
  final String question;
  final bool multiple;
  final bool anonymous;
  final bool closed;
  final DateTime? closedAt;
  final String creatorId;

  /// Distinct people who voted.
  final num totalVoters;
  final List<PollOptionDto> options;

  /// The options I chose.
  final List<String> myOptionIds;

  Map<String, Object?> toJson() => _$PollDtoToJson(this);
}
