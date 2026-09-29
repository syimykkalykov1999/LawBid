// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'suspend_user_dto.g.dart';

@JsonSerializable()
class SuspendUserDto {
  const SuspendUserDto({required this.reason});

  factory SuspendUserDto.fromJson(Map<String, Object?> json) =>
      _$SuspendUserDtoFromJson(json);

  final String reason;

  Map<String, Object?> toJson() => _$SuspendUserDtoToJson(this);
}
