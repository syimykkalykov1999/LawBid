import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-20: the attorney's running case timer, if any. The server
/// answers `null` when none runs, which the generated client cannot parse,
/// so any failure means "no timer".
final runningTimerProvider = FutureProvider.autoDispose<api.RunningTimerDto?>(
  (ref) async {
    try {
      final r = await guardApiCall(
        () => api.CaseBillingClient(ref.watch(dioProvider)).runningTimer(),
      );
      return r.data;
    } on Object {
      return null;
    }
  },
  retry: (retryCount, error) => null,
);

/// "● Timer running · 01:23:45 · case title" over "Mine"; a tap opens the
/// case. Nothing is drawn when no timer runs.
class RunningTimerChip extends ConsumerStatefulWidget {
  const RunningTimerChip({super.key});

  @override
  ConsumerState<RunningTimerChip> createState() => _RunningTimerChipState();
}

class _RunningTimerChipState extends ConsumerState<RunningTimerChip> {
  Timer? _tick;

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  void _ensureTick(bool running) {
    if (running && _tick == null) {
      _tick = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() {});
      });
    } else if (!running && _tick != null) {
      _tick!.cancel();
      _tick = null;
    }
  }

  static String clock(Duration d) {
    final s = d.inSeconds < 0 ? 0 : d.inSeconds;
    String two(int v) => v.toString().padLeft(2, '0');
    return '${two(s ~/ 3600)}:${two(s % 3600 ~/ 60)}:${two(s % 60)}';
  }

  @override
  Widget build(BuildContext context) {
    final timer = ref.watch(runningTimerProvider).value;
    _ensureTick(timer != null);
    if (timer == null) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final elapsed = DateTime.now().difference(timer.startedAt);
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.xs,
        AppSpacing.screenSide,
        AppSpacing.xs,
      ),
      child: Semantics(
        button: true,
        label: '${t.t('timer.running')} ${clock(elapsed)}. '
            '${t.t('timer.open')}: ${timer.caseTitle}',
        child: InkWell(
          key: const ValueKey('running-timer-chip'),
          borderRadius: BorderRadius.circular(AppRadii.field),
          onTap: () => context.push(AppRoutes.caseDetail(timer.caseId)),
          child: Container(
            constraints: const BoxConstraints(minHeight: 44),
            padding: const EdgeInsetsDirectional.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.xs,
            ),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(AppRadii.field),
              border: Border.all(color: colors.border),
            ),
            child: Row(
              children: [
                Icon(Icons.circle, size: 10, color: colors.danger),
                const SizedBox(width: AppSpacing.sm),
                Text(
                  clock(elapsed),
                  style: typography.bodySmall.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w600,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    timer.caseTitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: typography.bodySmall
                        .copyWith(color: colors.textSecondary),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
