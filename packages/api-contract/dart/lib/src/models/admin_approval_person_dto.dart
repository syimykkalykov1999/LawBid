// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_approval_person_dto.g.dart';

@JsonSerializable()
class AdminApprovalPersonDto {
  const AdminApprovalPersonDto({required this.id, required this.email});

  factory AdminApprovalPersonDto.fromJson(Map<String, Object?> json) =>
      _$AdminApprovalPersonDtoFromJson(json);

  final String id;
  final String? email;

  Map<String, Object?> toJson() => _$AdminApprovalPersonDtoToJson(this);
}
