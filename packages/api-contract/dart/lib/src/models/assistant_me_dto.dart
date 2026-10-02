// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'assistant_me_dto_state.dart';

part 'assistant_me_dto.g.dart';

@JsonSerializable()
class AssistantMeDto {
  const AssistantMeDto({
    required this.state,
    required this.duties,
    this.membershipId,
    this.attorneyId,
    this.attorneyName,
    this.attorneyUsername,
    this.attorneyAvatarUrl,
  });

  factory AssistantMeDto.fromJson(Map<String, Object?> json) =>
      _$AssistantMeDtoFromJson(json);

  /// Audit 2026-10-02: `paused` = joined, but the attorney's subscription.
  /// lapsed (the assistant can't work in the account until it's renewed).
  final AssistantMeDtoState state;
  final String? membershipId;

  /// The attorney's user id (the account the assistant acts in).
  final String? attorneyId;
  final String? attorneyName;
  final String? attorneyUsername;
  final String? attorneyAvatarUrl;
  final List<String> duties;

  Map<String, Object?> toJson() => _$AssistantMeDtoToJson(this);
}
