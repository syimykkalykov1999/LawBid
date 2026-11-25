// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_ok_dto.g.dart';

@JsonSerializable()
class HotlineOkDto {
  const HotlineOkDto({required this.ok});

  factory HotlineOkDto.fromJson(Map<String, Object?> json) =>
      _$HotlineOkDtoFromJson(json);

  final bool ok;

  Map<String, Object?> toJson() => _$HotlineOkDtoToJson(this);
}
