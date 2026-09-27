import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

/// Stage 1.5 stub (file 01 §15). Real content is file 5.
class SearchScreen extends ConsumerWidget {
  const SearchScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    return Scaffold(
      appBar: AppTopBar(title: Text(t.t('search.stub.title'))),
      body: AppEmptyState(
        icon: Icons.search_rounded,
        message: t.t('empty.default.message'),
      ),
    );
  }
}
