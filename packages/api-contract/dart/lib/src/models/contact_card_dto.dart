// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'contact_card_dto.g.dart';

@JsonSerializable()
class ContactCardDto {
  const ContactCardDto({
    required this.userId,
    required this.username,
    required this.displayName,
    required this.verifiedBadge,
    required this.firmNames,
    required this.practiceKeys,
    required this.licensedStates,
    this.avatarUrl,
  });

  factory ContactCardDto.fromJson(Map<String, Object?> json) =>
      _$ContactCardDtoFromJson(json);

  final String userId;
  final String username;
  final String displayName;
  final String? avatarUrl;

  /// The blue check.
  final bool verifiedBadge;

  /// Firm names.
  final List<String> firmNames;

  /// Translation keys of the practice areas (≤6).
  final List<String> practiceKeys;

  /// States of verified licenses.
  final List<String> licensedStates;

  Map<String, Object?> toJson() => _$ContactCardDtoToJson(this);
}
