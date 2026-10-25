// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'split_start_dto.g.dart';

@JsonSerializable()
class SplitStartDto {
  const SplitStartDto({required this.toDb, required this.shards});

  factory SplitStartDto.fromJson(Map<String, Object?> json) =>
      _$SplitStartDtoFromJson(json);

  final String toDb;

  /// Logical shards to move (0..255)
  final List<num> shards;

  Map<String, Object?> toJson() => _$SplitStartDtoToJson(this);
}
