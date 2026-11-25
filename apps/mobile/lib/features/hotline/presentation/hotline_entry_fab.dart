import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/hotline/application/hotline_controller.dart';
import 'package:lawbid/features/hotline/hotline_routes.dart';
import 'package:material_ui/material_ui.dart';

/// Owner row 87 (mockup v4 c1): the call button just above the «+» of
/// «Вопросы» — the app's one floating button (AppFab), gold with a handset,
/// the way the live-call button sits above the «+» of Chats. Only for a
/// client, only while «Флаги → Горячая линия» is on and the admin's mode is
/// not «Выкл для всех»; it goes away the moment either changes. A request
/// that waits shows the small live dot and opens its state.
class HotlineEntryFab extends ConsumerStatefulWidget {
  const HotlineEntryFab({super.key});

  @override
  ConsumerState<HotlineEntryFab> createState() => _HotlineEntryFabState();
}

class _HotlineEntryFabState extends ConsumerState<HotlineEntryFab> {
  @override
  void initState() {
    super.initState();
    if (ref.read(hotlineClientVisibleProvider)) _load();
  }

  void _load() {
    final c = ref.read(hotlineControllerProvider.notifier);
    if (ref.read(hotlineControllerProvider).config == null) {
      unawaited(c.loadConfig());
    }
    unawaited(c.restore());
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<bool>(hotlineClientVisibleProvider, (prev, on) {
      if (on && prev != true) _load();
    });
    if (!ref.watch(hotlineClientVisibleProvider)) {
      return const SizedBox.shrink();
    }
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final waiting =
        ref.watch(hotlineControllerProvider.select((s) => s.active));
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: AppFab(
        buttonKey: const ValueKey('qa-hotline'),
        semanticLabel: t.t(waiting ? 'hotline.c.fab.waiting' : 'hotline.c.fab'),
        icon: AppIcons.callRounded,
        background: colors.gold,
        foreground: colors.navy,
        liveDot: waiting,
        onPressed: () => unawaited(
          context.push(waiting ? HotlineRoutes.status : HotlineRoutes.form),
        ),
      ),
    );
  }
}
