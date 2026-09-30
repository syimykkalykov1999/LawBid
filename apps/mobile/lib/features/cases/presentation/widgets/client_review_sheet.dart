import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/profile/data/client_reviews_repository.dart';

/// OQ-038: "Review the client" on a case in work — the hired attorney
/// rates the client (1–5 stars + optional text). Editable; visible only to
/// attorneys and the client.
class ClientReviewAction extends ConsumerWidget {
  const ClientReviewAction({required this.caseId, super.key});

  final String caseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final mine = ref.watch(myClientReviewProvider(caseId)).value;
    return AppListRow(
      icon: Icons.star_outline_rounded,
      label: t.t('client.review.action'),
      trailingText: mine == null ? null : '★ ${mine.rating}',
      onTap: () async {
        final saved = await showAppBottomSheet<bool>(
          context: context,
          isScrollControlled: true,
          builder: (_) => _Sheet(
            caseId: caseId,
            rating: mine?.rating ?? 0,
            body: mine?.body ?? '',
          ),
        );
        if (saved == true && context.mounted) {
          ref.invalidate(myClientReviewProvider(caseId));
          showAppSnackBar(context, t.t('client.review.saved'));
        }
      },
    );
  }
}

class _Sheet extends ConsumerStatefulWidget {
  const _Sheet({required this.caseId, required this.rating, required this.body});

  final String caseId;
  final int rating;
  final String body;

  @override
  ConsumerState<_Sheet> createState() => _SheetState();
}

class _SheetState extends ConsumerState<_Sheet> {
  late int _rating = widget.rating;
  late final _text = TextEditingController(text: widget.body);
  bool _busy = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      await ref
          .read(clientReviewsRepositoryProvider)
          .save(widget.caseId, rating: _rating, body: _text.text);
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showAppSnackBar(context, errorText(t, e));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: EdgeInsets.fromLTRB(AppSpacing.screenSide, AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AppSheetHandle(),
          Text(t.t('client.review.title'),
              style: type.titleMedium.copyWith(color: colors.text)),
          const SizedBox(height: AppSpacing.xs),
          Text(t.t('client.review.hint'),
              style: type.bodySmall.copyWith(color: colors.textSecondary)),
          const SizedBox(height: AppSpacing.lg),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 1; i <= 5; i++)
                Semantics(
                  button: true,
                  selected: i <= _rating,
                  label: '$i',
                  child: IconButton(
                    iconSize: 40,
                    onPressed: () => setState(() => _rating = i),
                    icon: Icon(
                      i <= _rating
                          ? Icons.star_rounded
                          : Icons.star_outline_rounded,
                      color: colors.gold,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            controller: _text,
            maxLength: 2000,
            maxLines: 6,
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: t.t('client.review.save'),
            height: AppSizes.touchTarget,
            onPressed: _rating == 0 || _busy ? null : _save,
          ),
        ],
      ),
    );
  }
}
