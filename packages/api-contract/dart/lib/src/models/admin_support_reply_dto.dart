// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_support_reply_dto_status.dart';

part 'admin_support_reply_dto.g.dart';

@JsonSerializable()
class AdminSupportReplyDto {
  const AdminSupportReplyDto({
    required this.body,
    this.status,
    this.internal = false,
  });

  factory AdminSupportReplyDto.fromJson(Map<String, Object?> json) =>
      _$AdminSupportReplyDtoFromJson(json);

  final String body;

  /// Internal note: visible to admins only, no notification.
  final bool internal;

  /// Status after a public reply (default waiting_user). Ignored for internal notes.
  final AdminSupportReplyDtoStatus? status;

  Map<String, Object?> toJson() => _$AdminSupportReplyDtoToJson(this);
}
