import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/l10n_providers.dart';

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
      appBar: AppBar(
        backgroundColor: colors.bg,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.close, color: colors.text),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(t.t('create.stub.title')),
      ),
      body: AppEmptyState(message: t.t('empty.default.message')),
    );
  }
}
