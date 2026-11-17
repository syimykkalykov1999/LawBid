// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_end_dto.g.dart';

@JsonSerializable()
class HotlineEndDto {
  const HotlineEndDto({required this.ok, required this.seconds});

  factory HotlineEndDto.fromJson(Map<String, Object?> json) =>
      _$HotlineEndDtoFromJson(json);

  final bool ok;

  /// Talked seconds (from «Взять»).
  final num seconds;

  Map<String, Object?> toJson() => _$HotlineEndDtoToJson(this);
}
