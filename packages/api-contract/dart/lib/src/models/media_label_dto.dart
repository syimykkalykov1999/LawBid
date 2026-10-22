// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'media_label_dto.g.dart';

@JsonSerializable()
class MediaLabelDto {
  const MediaLabelDto({
    required this.name,
    required this.parent,
    required this.confidence,
  });

  factory MediaLabelDto.fromJson(Map<String, Object?> json) =>
      _$MediaLabelDtoFromJson(json);

  final String name;
  final String? parent;
  final num confidence;

  Map<String, Object?> toJson() => _$MediaLabelDtoToJson(this);
}
