// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'qr_login_preview_dto.g.dart';

@JsonSerializable()
class QrLoginPreviewDto {
  const QrLoginPreviewDto({
    required this.deviceName,
    required this.platform,
    required this.userAgent,
    required this.ipHint,
    required this.createdAt,
    required this.expiresIn,
  });
  
  factory QrLoginPreviewDto.fromJson(Map<String, Object?> json) => _$QrLoginPreviewDtoFromJson(json);
  
  final String? deviceName;
  final String? platform;
  final String? userAgent;

  /// Approximate address of the browser (last part hidden).
  final String? ipHint;
  final DateTime createdAt;

  /// Seconds left.
  final int expiresIn;

  Map<String, Object?> toJson() => _$QrLoginPreviewDtoToJson(this);
}
