// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'invite_call_dto.g.dart';

@JsonSerializable()
class InviteCallDto {
  const InviteCallDto({this.userId, this.username});

  factory InviteCallDto.fromJson(Map<String, Object?> json) =>
      _$InviteCallDtoFromJson(json);

  final String? userId;

  /// Username, with or without @.
  final String? username;

  Map<String, Object?> toJson() => _$InviteCallDtoToJson(this);
}
