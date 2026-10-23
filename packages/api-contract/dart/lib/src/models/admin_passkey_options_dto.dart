// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_passkey_options_dto.g.dart';

@JsonSerializable()
class AdminPasskeyOptionsDto {
  const AdminPasskeyOptionsDto({required this.ticket});

  factory AdminPasskeyOptionsDto.fromJson(Map<String, Object?> json) =>
      _$AdminPasskeyOptionsDtoFromJson(json);

  /// Ticket from login/password (5 minutes).
  final String ticket;

  Map<String, Object?> toJson() => _$AdminPasskeyOptionsDtoToJson(this);
}
