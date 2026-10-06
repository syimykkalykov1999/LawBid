// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'demo_created_by_dto_kind.dart';

part 'demo_created_by_dto.g.dart';

@JsonSerializable()
class DemoCreatedByDto {
  const DemoCreatedByDto({
    required this.kind,
    required this.userId,
    required this.name,
  });

  factory DemoCreatedByDto.fromJson(Map<String, Object?> json) =>
      _$DemoCreatedByDtoFromJson(json);

  final DemoCreatedByDtoKind kind;
  final String? userId;
  final String name;

  Map<String, Object?> toJson() => _$DemoCreatedByDtoToJson(this);
}
