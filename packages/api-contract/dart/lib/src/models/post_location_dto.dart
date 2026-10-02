// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'post_location_dto.g.dart';

@JsonSerializable()
class PostLocationDto {
  const PostLocationDto({required this.name, this.lat, this.lng});

  factory PostLocationDto.fromJson(Map<String, Object?> json) =>
      _$PostLocationDtoFromJson(json);

  final String name;
  final num? lat;
  final num? lng;

  Map<String, Object?> toJson() => _$PostLocationDtoToJson(this);
}
