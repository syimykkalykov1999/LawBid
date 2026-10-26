// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sfu_ok_dto.g.dart';

@JsonSerializable()
class SfuOkDto {
  const SfuOkDto({required this.ok});

  factory SfuOkDto.fromJson(Map<String, Object?> json) =>
      _$SfuOkDtoFromJson(json);

  final bool ok;

  Map<String, Object?> toJson() => _$SfuOkDtoToJson(this);
}
