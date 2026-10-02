// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_ban_dto_kind.dart';

part 'create_ban_dto.g.dart';

@JsonSerializable()
class CreateBanDto {
  const CreateBanDto({
    required this.kind,
    required this.value,
    required this.reason,
    this.days,
  });

  factory CreateBanDto.fromJson(Map<String, Object?> json) =>
      _$CreateBanDtoFromJson(json);

  final CreateBanDtoKind kind;

  /// Phone in +E.164, e-mail, device id or user id, as the kind says.
  final String value;
  final String reason;

  /// Days; empty = no end date.
  final num? days;

  Map<String, Object?> toJson() => _$CreateBanDtoToJson(this);
}
