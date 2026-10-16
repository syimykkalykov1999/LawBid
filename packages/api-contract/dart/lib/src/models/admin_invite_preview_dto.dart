// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_invite_preview_dto.g.dart';

@JsonSerializable()
class AdminInvitePreviewDto {
  const AdminInvitePreviewDto({required this.email});

  factory AdminInvitePreviewDto.fromJson(Map<String, Object?> json) =>
      _$AdminInvitePreviewDtoFromJson(json);

  /// The address the link is for.
  final String email;

  Map<String, Object?> toJson() => _$AdminInvitePreviewDtoToJson(this);
}
