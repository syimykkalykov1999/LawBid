// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'qr_login_created_dto.g.dart';

@JsonSerializable()
class QrLoginCreatedDto {
  const QrLoginCreatedDto({
    required this.qrId,
    required this.pollSecret,
    required this.qrUrl,
    required this.expiresIn,
  });
  
  factory QrLoginCreatedDto.fromJson(Map<String, Object?> json) => _$QrLoginCreatedDtoFromJson(json);
  
  /// Public id in the QR code (single use).
  final String qrId;

  /// Secret only this browser knows; sent with every poll. Never shown in the QR code.
  final String pollSecret;

  /// The address encoded in the QR code.
  final String qrUrl;

  /// Seconds until it expires.
  final int expiresIn;

  Map<String, Object?> toJson() => _$QrLoginCreatedDtoToJson(this);
}
