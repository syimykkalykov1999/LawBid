import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/hotline/application/hotline_attorney_providers.dart';
import 'package:lawbid/features/hotline/hotline_attorney_routes.dart';
import 'package:material_ui/material_ui.dart';

/// The attorney's hotline button on «Моё → Вопросы» (mockup a1): the app's
/// floating button with the call icon. Hidden while the flag is off, for an
/// assistant, and on «Выкл для всех».
class HotlineAttorneyFab extends ConsumerWidget {
  const HotlineAttorneyFab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(hotlineAttorneyVisibleProvider)) {
      return const SizedBox.shrink();
    }
    final t = ref.watch(translatorProvider);
    return AppFab(
      buttonKey: const ValueKey('hotline-attorney-fab'),
      icon: AppIcons.callRounded,
      semanticLabel: t.t('hotline.att.fab'),
      onPressed: () =>
          unawaited(context.push<void>(HotlineAttorneyRoutes.line)),
    );
  }
}
