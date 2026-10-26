// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'my_flags_dto.g.dart';

@JsonSerializable()
class MyFlagsDto {
  const MyFlagsDto({required this.flags});

  factory MyFlagsDto.fromJson(Map<String, Object?> json) =>
      _$MyFlagsDtoFromJson(json);

  /// Every flag as THIS user sees it: a flag rolled out to part of the users is resolved by a stable hash of (flag, user).
  final Map<String, bool> flags;

  Map<String, Object?> toJson() => _$MyFlagsDtoToJson(this);
}
