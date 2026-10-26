// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_invite_dto.g.dart';

@JsonSerializable()
class CreateInviteDto {
  const CreateInviteDto({
    required this.attorneyId,
    this.message,
    this.budgetCents,
  });

  factory CreateInviteDto.fromJson(Map<String, Object?> json) =>
      _$CreateInviteDtoFromJson(json);

  /// The attorney to invite.
  final String attorneyId;

  /// A note to the attorney (no contacts).
  final String? message;

  /// The budget the client proposes, in cents.
  final int? budgetCents;

  Map<String, Object?> toJson() => _$CreateInviteDtoToJson(this);
}
