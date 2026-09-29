// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'read_result_dto.g.dart';

@JsonSerializable()
class ReadResultDto {
  const ReadResultDto({this.lastReadMessageId});

  factory ReadResultDto.fromJson(Map<String, Object?> json) =>
      _$ReadResultDtoFromJson(json);

  final String? lastReadMessageId;

  Map<String, Object?> toJson() => _$ReadResultDtoToJson(this);
}
