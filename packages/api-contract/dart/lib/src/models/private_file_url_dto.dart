// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'private_file_url_dto.g.dart';

@JsonSerializable()
class PrivateFileUrlDto {
  const PrivateFileUrlDto({required this.url, required this.expiresAt});

  factory PrivateFileUrlDto.fromJson(Map<String, Object?> json) =>
      _$PrivateFileUrlDtoFromJson(json);

  final String url;
  final DateTime expiresAt;

  Map<String, Object?> toJson() => _$PrivateFileUrlDtoToJson(this);
}
