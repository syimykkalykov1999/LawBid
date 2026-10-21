// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ongoing_call_person_dto.dart';

part 'ongoing_call_dto.g.dart';

@JsonSerializable()
class OngoingCallDto {
  const OngoingCallDto({
    required this.id,
    required this.video,
    required this.participantCount,
    required this.participants,
    required this.startedAt,
  });

  factory OngoingCallDto.fromJson(Map<String, Object?> json) =>
      _$OngoingCallDtoFromJson(json);

  final String id;
  final bool video;

  /// People in the call now.
  final num participantCount;

  /// The first few people in the call (up to 3), for faces.
  final List<OngoingCallPersonDto> participants;
  final DateTime startedAt;

  Map<String, Object?> toJson() => _$OngoingCallDtoToJson(this);
}
