// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'qr_login_poll_dto.g.dart';

@JsonSerializable()
class QrLoginPollDto {
  const QrLoginPollDto({required this.qrId, required this.pollSecret});

  factory QrLoginPollDto.fromJson(Map<String, Object?> json) =>
      _$QrLoginPollDtoFromJson(json);

  final String qrId;
  final String pollSecret;

  Map<String, Object?> toJson() => _$QrLoginPollDtoToJson(this);
}
