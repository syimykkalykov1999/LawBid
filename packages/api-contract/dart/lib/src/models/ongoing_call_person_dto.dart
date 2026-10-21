// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ongoing_call_person_dto.g.dart';

@JsonSerializable()
class OngoingCallPersonDto {
  const OngoingCallPersonDto({
    required this.userId,
    this.displayName,
    this.avatarUrl,
  });

  factory OngoingCallPersonDto.fromJson(Map<String, Object?> json) =>
      _$OngoingCallPersonDtoFromJson(json);

  final String userId;
  final String? displayName;
  final String? avatarUrl;

  Map<String, Object?> toJson() => _$OngoingCallPersonDtoToJson(this);
}
