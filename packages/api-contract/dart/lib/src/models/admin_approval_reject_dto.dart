// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_approval_reject_dto.g.dart';

@JsonSerializable()
class AdminApprovalRejectDto {
  const AdminApprovalRejectDto({this.note});

  factory AdminApprovalRejectDto.fromJson(Map<String, Object?> json) =>
      _$AdminApprovalRejectDtoFromJson(json);

  /// Why (optional).
  final String? note;

  Map<String, Object?> toJson() => _$AdminApprovalRejectDtoToJson(this);
}
