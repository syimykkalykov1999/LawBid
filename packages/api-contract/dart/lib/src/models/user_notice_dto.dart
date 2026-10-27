// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'user_notice_dto.g.dart';

@JsonSerializable()
class UserNoticeDto {
  const UserNoticeDto({
    required this.allowed,
    required this.blockedReason,
    required this.text,
    required this.language,
    required this.userNotifiedAt,
  });

  factory UserNoticeDto.fromJson(Map<String, Object?> json) =>
      _$UserNoticeDtoFromJson(json);

  /// May the notice be sent right now?
  final bool allowed;
  final String? blockedReason;

  /// The text the user would get.
  final String text;

  /// ru | en
  final String language;
  final String? userNotifiedAt;

  Map<String, Object?> toJson() => _$UserNoticeDtoToJson(this);
}
