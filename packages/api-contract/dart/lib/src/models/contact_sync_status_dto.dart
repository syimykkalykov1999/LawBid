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
    required this.findByPhone,
    required this.notifyJoined,
    this.syncedAt,
    this.phoneRegion,
  });

  factory ContactSyncStatusDto.fromJson(Map<String, Object?> json) =>
      _$ContactSyncStatusDtoFromJson(json);

  /// The user has contacts sync turned on.
  final bool enabled;

  /// People from the address book found on LawBid.
  final int matches;
  final DateTime? syncedAt;

  /// "Find me by my number" (clients; attorneys are public).
  final bool findByPhone;

  /// ISO country of the account number ("US", "KG"): the default region for national-format numbers in the address book.
  final String? phoneRegion;

  /// «Notify me when contacts join LawBid» (owner 2026-10-22: sent by the server).
  final bool notifyJoined;

  Map<String, Object?> toJson() => _$ContactSyncStatusDtoToJson(this);
}
