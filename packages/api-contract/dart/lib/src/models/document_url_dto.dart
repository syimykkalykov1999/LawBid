// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'document_url_dto.g.dart';

@JsonSerializable()
class DocumentUrlDto {
  const DocumentUrlDto({required this.url, required this.expiresAt});

  factory DocumentUrlDto.fromJson(Map<String, Object?> json) =>
      _$DocumentUrlDtoFromJson(json);

  /// Short-lived signed link.
  final String url;
  final DateTime expiresAt;

  Map<String, Object?> toJson() => _$DocumentUrlDtoToJson(this);
}
