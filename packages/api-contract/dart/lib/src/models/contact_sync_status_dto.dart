// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'contact_sync_status_dto.g.dart';

@JsonSerializable()
class ContactSyncStatusDto {
  const ContactSyncStatusDto({
    required this.enabled,
    required this.matches,
    this.syncedAt,
  });

  factory ContactSyncStatusDto.fromJson(Map<String, Object?> json) =>
      _$ContactSyncStatusDtoFromJson(json);

  /// The user has contacts sync turned on.
  final bool enabled;

  /// People from the address book found on LawBid.
  final int matches;
  final DateTime? syncedAt;

  Map<String, Object?> toJson() => _$ContactSyncStatusDtoToJson(this);
}
