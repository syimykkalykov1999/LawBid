import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/deadlines/data/deadlines_repository.dart';
import 'package:lawbid/features/deadlines/domain/deadline_models.dart';

/// Owner 2026-10-20: the flag that shows every entry of the calculator.
const kDeadlineCalculatorFlag = 'deadline_calculator';

final deadlinesEnabledProvider = Provider<bool>(
  (ref) => ref
      .watch(featureFlagsControllerProvider)
      .isEnabled(kDeadlineCalculatorFlag),
);

final deadlinesRepositoryProvider = Provider<DeadlinesRepository>(
  (ref) => DeadlinesRepository(ref.watch(dioProvider)),
);

/// Federal rules plus the state's (`''` = federal only).
final deadlineRulesProvider =
    FutureProvider.autoDispose.family<List<DeadlineRule>, String>(
  (ref, state) => ref
      .watch(deadlinesRepositoryProvider)
      .rules(jurisdiction: state.isEmpty ? 'US' : state),
);

/// One calculation; the same input is answered from the cache while the
/// screen is open.
final deadlineResultProvider =
    FutureProvider.autoDispose.family<DeadlineResult, DeadlineQuery>(
  (ref, q) =>
      ref.watch(deadlinesRepositoryProvider).calculate(q.ruleCode, q.eventDate),
);
