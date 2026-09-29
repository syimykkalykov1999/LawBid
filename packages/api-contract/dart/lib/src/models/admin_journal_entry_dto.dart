// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_journal_entry_dto.g.dart';

@JsonSerializable()
class AdminJournalEntryDto {
  const AdminJournalEntryDto({
    required this.id,
    required this.eventType,
    required this.actorRole,
    required this.actorUserId,
    required this.payload,
    required this.createdAt,
  });

  factory AdminJournalEntryDto.fromJson(Map<String, Object?> json) =>
      _$AdminJournalEntryDtoFromJson(json);

  final String id;
  final String eventType;
  final String? actorRole;
  final String? actorUserId;
  final dynamic payload;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminJournalEntryDtoToJson(this);
}
