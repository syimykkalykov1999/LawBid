// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'media_check_dto.dart';

part 'media_check_page_dto.g.dart';

@JsonSerializable()
class MediaCheckPageDto {
  const MediaCheckPageDto({required this.items, required this.nextCursor});

  factory MediaCheckPageDto.fromJson(Map<String, Object?> json) =>
      _$MediaCheckPageDtoFromJson(json);

  final List<MediaCheckDto> items;
  final String? nextCursor;

  Map<String, Object?> toJson() => _$MediaCheckPageDtoToJson(this);
}
