import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart'
    show BounceIcon;

/// Owner 2026-10-13: Save on its own (the case card's row puts it next to
/// the time, on the right).
class CaseSaveButton extends ConsumerStatefulWidget {
  const CaseSaveButton({required this.item, super.key});

  final FeedCase item;

  @override
  ConsumerState<CaseSaveButton> createState() => _CaseSaveButtonState();
}

class _CaseSaveButtonState extends ConsumerState<CaseSaveButton> {
  bool? _saved;

  Future<void> _toggle() async {
    final t = ref.read(translatorProvider);
    final next = !(_saved ?? widget.item.isSaved);
    setState(() => _saved = next);
    try {
      await ref.read(caseActionsProvider).setSaved(widget.item.id, saved: next);
      if (mounted) {
        showAppSnackBar(
          context,
          t.t(next ? 'cases.saved.added' : 'cases.saved.removed'),
        );
      }
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _saved = !next);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final saved = _saved ?? widget.item.isSaved;
    return BounceIcon(
      active: saved,
      icon: AppIcons.bookmarkBorderRounded,
      activeIcon: AppIcons.bookmarkRounded,
      activeColor: colors.iconTint,
      label: t.t(saved ? 'post.unsave' : 'post.save'),
      onTap: _toggle,
    );
  }
}
