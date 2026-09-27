import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

/// Stage 1.5 stub (file 01 §15). Real content (Мои кейсы/биды, Сохранённое)
/// is file 4.
class MineScreen extends ConsumerWidget {
  const MineScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    return Scaffold(
      appBar: AppTopBar(title: Text(t.t('mine.stub.title'))),
      body: AppEmptyState(
        icon: Icons.folder_open_rounded,
        message: t.t('empty.default.message'),
      ),
    );
  }
}
