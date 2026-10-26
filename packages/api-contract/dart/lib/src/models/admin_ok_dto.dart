// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_ok_dto.g.dart';

@JsonSerializable()
class AdminOkDto {
  const AdminOkDto({required this.ok});

  factory AdminOkDto.fromJson(Map<String, Object?> json) =>
      _$AdminOkDtoFromJson(json);

  final bool ok;

  Map<String, Object?> toJson() => _$AdminOkDtoToJson(this);
}
