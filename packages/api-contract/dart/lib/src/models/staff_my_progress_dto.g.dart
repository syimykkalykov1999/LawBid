// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_my_progress_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffMyProgressDto _$StaffMyProgressDtoFromJson(Map<String, dynamic> json) =>
    StaffMyProgressDto(
      snapshotDate: DateTime.parse(json['snapshotDate'] as String),
      rating: json['rating'] as num?,
      status: StaffRatingStatus.fromJson(json['status'] as String),
      decisions: (json['decisions'] as num).toInt(),
      rankPct: json['rankPct'] as num?,
      flags: (json['flags'] as List<dynamic>).map((e) => e as String).toList(),
      accuracy: json['accuracy'] as num?,
      clean: json['clean'] as num?,
      usersVerdict: json['usersVerdict'] as num?,
      speed: json['speed'] as num?,
      openSuggestions: (json['openSuggestions'] as List<dynamic>)
          .map(
            (e) => StaffMyOpenSuggestionDto.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
      evidence: StaffMyProgressEvidenceDto.fromJson(
        json['evidence'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$StaffMyProgressDtoToJson(
  StaffMyProgressDto instance,
) => <String, dynamic>{
  'snapshotDate': instance.snapshotDate.toIso8601String(),
  'rating': ?instance.rating,
  'status': instance.status.toJson(),
  'decisions': instance.decisions,
  'rankPct': ?instance.rankPct,
  'flags': instance.flags,
  'accuracy': ?instance.accuracy,
  'clean': ?instance.clean,
  'usersVerdict': ?instance.usersVerdict,
  'speed': ?instance.speed,
  'openSuggestions': instance.openSuggestions.map((e) => e.toJson()).toList(),
  'evidence': instance.evidence.toJson(),
};
