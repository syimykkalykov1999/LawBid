// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_person_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffPersonDto _$StaffPersonDtoFromJson(Map<String, dynamic> json) =>
    StaffPersonDto(
      adminId: json['adminId'] as String,
      name: json['name'] as String,
      workspace: StaffWorkspaceName.fromJson(json['workspace'] as String),
      rating: json['rating'] as num?,
      decisions: json['decisions'] as num,
      status: StaffRatingStatus.fromJson(json['status'] as String),
      flags: (json['flags'] as List<dynamic>).map((e) => e as String).toList(),
      rankPct: json['rankPct'] as num?,
      accuracy: json['accuracy'] as num?,
      clean: json['clean'] as num?,
      usersVerdict: json['usersVerdict'] as num?,
      speed: json['speed'] as num?,
      openSuggestions: (json['openSuggestions'] as List<dynamic>)
          .map(
            (e) => StaffOpenSuggestionDto.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
    );

Map<String, dynamic> _$StaffPersonDtoToJson(
  StaffPersonDto instance,
) => <String, dynamic>{
  'adminId': instance.adminId,
  'name': instance.name,
  'workspace': instance.workspace.toJson(),
  'rating': ?instance.rating,
  'decisions': instance.decisions,
  'status': instance.status.toJson(),
  'flags': instance.flags,
  'rankPct': ?instance.rankPct,
  'accuracy': ?instance.accuracy,
  'clean': ?instance.clean,
  'usersVerdict': ?instance.usersVerdict,
  'speed': ?instance.speed,
  'openSuggestions': instance.openSuggestions.map((e) => e.toJson()).toList(),
};
