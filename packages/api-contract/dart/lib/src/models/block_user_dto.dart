// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'block_user_dto.g.dart';

@JsonSerializable()
class BlockUserDto {
  const BlockUserDto({
    required this.reason,
    this.banPhone = false,
    this.banEmail = false,
    this.banDevices = false,
    this.days,
  });

  factory BlockUserDto.fromJson(Map<String, Object?> json) =>
      _$BlockUserDtoFromJson(json);

  final String reason;

  /// Days; empty = no end date.
  final num? days;
  final bool banPhone;
  final bool banEmail;

  /// Every device the user signed in from.
  final bool banDevices;

  Map<String, Object?> toJson() => _$BlockUserDtoToJson(this);
}
