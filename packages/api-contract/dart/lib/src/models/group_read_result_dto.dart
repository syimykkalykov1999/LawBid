// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'group_read_result_dto.g.dart';

@JsonSerializable()
class GroupReadResultDto {
  const GroupReadResultDto({this.lastReadMessageId});

  factory GroupReadResultDto.fromJson(Map<String, Object?> json) =>
      _$GroupReadResultDtoFromJson(json);

  final String? lastReadMessageId;

  Map<String, Object?> toJson() => _$GroupReadResultDtoToJson(this);
}
