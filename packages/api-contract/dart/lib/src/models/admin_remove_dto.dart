// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_remove_dto.g.dart';

@JsonSerializable()
class AdminRemoveDto {
  const AdminRemoveDto({required this.reason});

  factory AdminRemoveDto.fromJson(Map<String, Object?> json) =>
      _$AdminRemoveDtoFromJson(json);

  final String reason;

  Map<String, Object?> toJson() => _$AdminRemoveDtoToJson(this);
}
