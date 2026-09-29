// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_login_start_dto.g.dart';

@JsonSerializable()
class AdminLoginStartDto {
  const AdminLoginStartDto({required this.email});

  factory AdminLoginStartDto.fromJson(Map<String, Object?> json) =>
      _$AdminLoginStartDtoFromJson(json);

  final String email;

  Map<String, Object?> toJson() => _$AdminLoginStartDtoToJson(this);
}
