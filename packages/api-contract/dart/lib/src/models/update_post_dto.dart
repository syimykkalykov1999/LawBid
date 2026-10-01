// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_post_dto.g.dart';

@JsonSerializable()
class UpdatePostDto {
  const UpdatePostDto({required this.body, this.title, this.practiceCode});

  factory UpdatePostDto.fromJson(Map<String, Object?> json) =>
      _$UpdatePostDtoFromJson(json);

  final String? title;
  final String? practiceCode;
  final String body;

  Map<String, Object?> toJson() => _$UpdatePostDtoToJson(this);
}
