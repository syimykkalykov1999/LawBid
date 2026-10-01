import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/profile/data/client_reviews_repository.dart';

/// OQ-038: "Review the client" on a case in work — the hired attorney
/// rates the client (1–5 stars + optional text). Editable; every signed-in
/// user sees client reviews (owner 2026-09-30).
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
        final saved = await showClientReviewSheet(
          context,
          rating: mine?.rating ?? 0,
          body: mine?.body ?? '',
          onSave: (rating, body) => ref
              .read(clientReviewsRepositoryProvider)
              .save(caseId, rating: rating, body: body),
        );
        if (saved == true && context.mounted) {
          ref.invalidate(myClientReviewProvider(caseId));
          showAppSnackBar(context, t.t('client.review.saved'));
        }
      },
    );
  }
}

/// Owner 2026-09-30: the star + text form, shared by the case ("Review
/// the client") and the client's profile (anyone reviews a client).
/// True when saved.
Future<bool?> showClientReviewSheet(
  BuildContext context, {
  required int rating,
  required String body,
  required Future<Object?> Function(int rating, String body) onSave,
  String titleKey = 'client.review.title',
  String hintKey = 'client.review.hint',
}) =>
    showAppBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _Sheet(
        rating: rating,
        body: body,
        onSave: onSave,
        titleKey: titleKey,
        hintKey: hintKey,
      ),
    );

class _Sheet extends ConsumerStatefulWidget {
  const _Sheet({
    required this.rating,
    required this.body,
    required this.onSave,
    required this.titleKey,
    required this.hintKey,
  });

  final String titleKey;
  final String hintKey;
  final int rating;
  final String body;
  final Future<Object?> Function(int rating, String body) onSave;

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
      await widget.onSave(_rating, _text.text);
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
      padding: EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AppSheetHandle(),
          Text(t.t(widget.titleKey),
              style: type.titleMedium.copyWith(color: colors.text)),
          const SizedBox(height: AppSpacing.xs),
          Text(t.t(widget.hintKey),
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
