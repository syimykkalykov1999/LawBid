// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'qr_login_poll_result_dto_status.dart';

part 'qr_login_poll_result_dto.g.dart';

@JsonSerializable()
class QrLoginPollResultDto {
  const QrLoginPollResultDto({
    required this.status,
    required this.accessToken,
    required this.refreshToken,
    required this.accessTokenExpiresIn,
  });

  factory QrLoginPollResultDto.fromJson(Map<String, Object?> json) =>
      _$QrLoginPollResultDtoFromJson(json);

  /// pending: not scanned; scanned: the phone shows the confirm screen; approved: tokens below (once); rejected / expired: ask for a new code.
  final QrLoginPollResultDtoStatus status;
  final String? accessToken;
  final String? refreshToken;
  final int? accessTokenExpiresIn;

  Map<String, Object?> toJson() => _$QrLoginPollResultDtoToJson(this);
}
