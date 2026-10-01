// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_overview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminOverviewDto _$AdminOverviewDtoFromJson(Map<String, dynamic> json) =>
    AdminOverviewDto(
      clients: (json['clients'] as num).toInt(),
      attorneys: (json['attorneys'] as num).toInt(),
      attorneysVerified: (json['attorneysVerified'] as num).toInt(),
      assistants: (json['assistants'] as num).toInt(),
      subscriptionsMonthly: (json['subscriptionsMonthly'] as num).toInt(),
      subscriptionsYearly: (json['subscriptionsYearly'] as num).toInt(),
      assistantSeats: (json['assistantSeats'] as num).toInt(),
      revenue30dCents: (json['revenue30dCents'] as num).toInt(),
      cases7d: (json['cases7d'] as num).toInt(),
      bids7d: (json['bids7d'] as num).toInt(),
      posts7d: (json['posts7d'] as num).toInt(),
      messages7d: (json['messages7d'] as num).toInt(),
      calls7d: (json['calls7d'] as num).toInt(),
      callsMissed7d: (json['callsMissed7d'] as num).toInt(),
      tasksOpen: (json['tasksOpen'] as num).toInt(),
      tasksDone30d: (json['tasksDone30d'] as num).toInt(),
      requestsPending: (json['requestsPending'] as num).toInt(),
    );

Map<String, dynamic> _$AdminOverviewDtoToJson(AdminOverviewDto instance) =>
    <String, dynamic>{
      'clients': instance.clients,
      'attorneys': instance.attorneys,
      'attorneysVerified': instance.attorneysVerified,
      'assistants': instance.assistants,
      'subscriptionsMonthly': instance.subscriptionsMonthly,
      'subscriptionsYearly': instance.subscriptionsYearly,
      'assistantSeats': instance.assistantSeats,
      'revenue30dCents': instance.revenue30dCents,
      'cases7d': instance.cases7d,
      'bids7d': instance.bids7d,
      'posts7d': instance.posts7d,
      'messages7d': instance.messages7d,
      'calls7d': instance.calls7d,
      'callsMissed7d': instance.callsMissed7d,
      'tasksOpen': instance.tasksOpen,
      'tasksDone30d': instance.tasksDone30d,
      'requestsPending': instance.requestsPending,
    };
