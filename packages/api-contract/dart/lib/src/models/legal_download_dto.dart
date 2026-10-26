// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'legal_download_dto.g.dart';

@JsonSerializable()
class LegalDownloadDto {
  const LegalDownloadDto({
    required this.url,
    required this.expiresAt,
    required this.sha256,
  });

  factory LegalDownloadDto.fromJson(Map<String, Object?> json) =>
      _$LegalDownloadDtoFromJson(json);

  final String url;
  final String expiresAt;
  final String? sha256;

  Map<String, Object?> toJson() => _$LegalDownloadDtoToJson(this);
}
