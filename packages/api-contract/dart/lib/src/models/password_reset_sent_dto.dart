// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'password_reset_sent_dto_channel.dart';

part 'password_reset_sent_dto.g.dart';

@JsonSerializable()
class PasswordResetSentDto {
  const PasswordResetSentDto({required this.sent, required this.channel});

  factory PasswordResetSentDto.fromJson(Map<String, Object?> json) =>
      _$PasswordResetSentDtoFromJson(json);

  final bool sent;

  /// Where the code went: the verified e-mail when there is one, else SMS.
  final PasswordResetSentDtoChannel channel;

  Map<String, Object?> toJson() => _$PasswordResetSentDtoToJson(this);
}
