// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_support_user_ref_dto.g.dart';

@JsonSerializable()
class AdminSupportUserRefDto {
  const AdminSupportUserRefDto({
    required this.id,
    required this.name,
    this.role,
  });

  factory AdminSupportUserRefDto.fromJson(Map<String, Object?> json) =>
      _$AdminSupportUserRefDtoFromJson(json);

  final String id;
  final String name;
  final String? role;

  Map<String, Object?> toJson() => _$AdminSupportUserRefDtoToJson(this);
}
