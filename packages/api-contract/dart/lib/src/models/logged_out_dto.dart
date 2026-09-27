// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'logged_out_dto.g.dart';

@JsonSerializable()
class LoggedOutDto {
  const LoggedOutDto({required this.loggedOut});

  factory LoggedOutDto.fromJson(Map<String, Object?> json) =>
      _$LoggedOutDtoFromJson(json);

  /// Always true.
  final bool loggedOut;

  Map<String, Object?> toJson() => _$LoggedOutDtoToJson(this);
}
