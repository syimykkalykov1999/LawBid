// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'username_check_reason.dart';

part 'username_check_dto.g.dart';

@JsonSerializable()
class UsernameCheckDto {
  const UsernameCheckDto({
    required this.username,
    required this.available,
    required this.reason,
    required this.suggestions,
  });

  factory UsernameCheckDto.fromJson(Map<String, Object?> json) =>
      _$UsernameCheckDtoFromJson(json);

  /// Normalized: lower case, no @.
  final String username;
  final bool available;

  /// invalid · reserved · taken · held (freed lately, waits for its old owner) · similar (reads like another handle); null when free.
  final UsernameCheckReason? reason;

  /// 3–5 free handles to offer; empty when available.
  final List<String> suggestions;

  Map<String, Object?> toJson() => _$UsernameCheckDtoToJson(this);
}
