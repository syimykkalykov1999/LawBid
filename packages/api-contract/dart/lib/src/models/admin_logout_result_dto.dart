// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_logout_result_dto.g.dart';

@JsonSerializable()
class AdminLogoutResultDto {
  const AdminLogoutResultDto({required this.ok});

  factory AdminLogoutResultDto.fromJson(Map<String, Object?> json) =>
      _$AdminLogoutResultDtoFromJson(json);

  final bool ok;

  Map<String, Object?> toJson() => _$AdminLogoutResultDtoToJson(this);
}
