import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/support/application/support_providers.dart';
import 'package:lawbid/features/support/domain/support_models.dart';

/// Owner 2026-10-02 — a new request to the team: topic, subject, message.
class SupportNewScreen extends ConsumerStatefulWidget {
  const SupportNewScreen({super.key});

  @override
  ConsumerState<SupportNewScreen> createState() => _SupportNewScreenState();
}

class _SupportNewScreenState extends ConsumerState<SupportNewScreen> {
  final _subject = TextEditingController();
  final _body = TextEditingController();
  SupportCategory _category = SupportCategory.account;
  bool _sending = false;

  @override
  void dispose() {
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }

  bool get _valid =>
      _subject.text.trim().length >= 3 && _body.text.trim().length >= 5;

  Future<void> _send() async {
    final t = ref.read(translatorProvider);
    setState(() => _sending = true);
    try {
      final ticket = await ref.read(supportRepositoryProvider).create(
            category: _category,
            subject: _subject.text.trim(),
            body: _body.text.trim(),
          );
      if (!mounted) return;
      showAppSnackBar(context, t.t('support.sent'));
      // Replace this form with the new thread.
      context.pushReplacement(AppRoutes.supportTicket(ticket.id));
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('support.new')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.screenSide),
                children: [
                  Text(
                    t.t('support.topic'),
                    style: type.bodySmall.copyWith(
                      color: colors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.sm,
                    children: [
                      for (final c in SupportCategory.values)
                        ChoiceChip(
                          label: Text(t.t('support.category.${c.wire}')),
                          selected: _category == c,
                          selectedColor: colors.goldTint,
                          side: BorderSide(
                            color: _category == c
                                ? colors.goldStroke
                                : colors.border,
                          ),
                          labelStyle: type.bodySmall.copyWith(
                            color:
                                _category == c ? colors.goldDark : colors.text,
                          ),
                          onSelected: (_) => setState(() => _category = c),
                        ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  AppTextField(
                    controller: _subject,
                    hintText: t.t('support.subject'),
                    semanticLabel: t.t('support.subject'),
                    maxLength: 120,
                    textCapitalization: TextCapitalization.sentences,
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  AppTextField(
                    controller: _body,
                    hintText: t.t('support.message'),
                    semanticLabel: t.t('support.message'),
                    maxLength: 4000,
                    maxLines: 8,
                    textCapitalization: TextCapitalization.sentences,
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    t.t('support.hint'),
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.screenSide),
              child: AppButton(
                label: t.t('support.send'),
                icon: AppIcons.sendRounded,
                isLoading: _sending,
                isEnabled: _valid && !_sending,
                onPressed: _send,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
