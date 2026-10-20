// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'username_unavailable_reason.dart';

part 'username_availability_dto.g.dart';

@JsonSerializable()
class UsernameAvailabilityDto {
  const UsernameAvailabilityDto({
    required this.username,
    required this.available,
    required this.reason,
    required this.suggestions,
  });

  factory UsernameAvailabilityDto.fromJson(Map<String, Object?> json) =>
      _$UsernameAvailabilityDtoFromJson(json);

  final String username;
  final bool available;

  /// Why it is not available; null when available.
  final UsernameUnavailableReason? reason;

  /// Free handles to offer instead (owner 2026-10-18); empty when available.
  final List<String> suggestions;

  Map<String, Object?> toJson() => _$UsernameAvailabilityDtoToJson(this);
}
