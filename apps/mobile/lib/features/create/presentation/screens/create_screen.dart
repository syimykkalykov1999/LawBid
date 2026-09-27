import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

/// Stage 1.5 stub for the "+" full-screen creation flow (file 07 §3.4:
/// "Экран открывается как full-screen с крестиком"). Real content (Создать
/// кейс for clients, Пост в ленту for attorneys) is files 4/5 — this stub
/// only proves the navigation shape (full-screen, closable) works.
class CreateScreen extends ConsumerWidget {
  const CreateScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Scaffold(
      backgroundColor: colors.bg,
      // UI modernization pass (2026-09-27): design-system top bar with a
      // 44x44 close target instead of the raw Material AppBar.
      appBar: AppTopBar(
        leading: Semantics(
          button: true,
          label: t.t('common.close'),
          excludeSemantics: true,
          child: AppPressable(
            onTap: () => Navigator.of(context).pop(),
            child: SizedBox.square(
              dimension: AppSizes.touchTarget,
              child: Icon(
                Icons.close_rounded,
                color: colors.text,
                size: AppSizes.iconMd,
              ),
            ),
          ),
        ),
        title: Text(t.t('create.stub.title')),
      ),
      body: AppEmptyState(
        icon: Icons.edit_note_rounded,
        message: t.t('empty.default.message'),
      ),
    );
  }
}
