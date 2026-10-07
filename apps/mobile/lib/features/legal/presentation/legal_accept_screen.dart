import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/auth/application/sign_out.dart';
import 'package:lawbid/features/legal/application/legal_providers.dart';
import 'package:lawbid/features/legal/domain/legal_documents.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/consent_check_tile.dart';

/// `/legal-accept` — Owner 2026-10-05 (legal documents). Shown after
/// sign-in while `GET /users/me` lists documents of the user's role that
/// they have not accepted at the current version (a new agreement, or a
/// material change to one they accepted). Each document has a link to read
/// it in full ([AppRoutes.legalDoc]) and its own UNCHECKED box; «Принять»
/// stays inert until every box is ticked. The guard (AppRouterGuard) keeps
/// the user here until `pendingLegalDocuments` is empty, so this screen
/// never navigates itself.
class LegalAcceptScreen extends ConsumerStatefulWidget {
  const LegalAcceptScreen({super.key});

  @override
  ConsumerState<LegalAcceptScreen> createState() => _LegalAcceptScreenState();
}

class _LegalAcceptScreenState extends ConsumerState<LegalAcceptScreen> {
  /// Ticked document ids. Starts empty: nothing is pre-ticked.
  final Set<String> _ticked = {};
  bool _busy = false;
  Object? _error;

  Future<void> _accept(List<PendingLegalDocument> docs) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(legalRepositoryProvider).accept([
        for (final d in docs) d.id,
      ]);
      // The fresh /users/me has an empty list; the guard moves on.
      await ref.read(currentUserControllerProvider.notifier).load();
      if (mounted) setState(() => _busy = false);
    } on Object catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final docs = [
      ...?ref.watch(
        currentUserControllerProvider.select(
          (s) => s.user?.pendingLegalDocuments,
        ),
      ),
    ]..sort((a, b) => legalDocRank(a.docType) - legalDocRank(b.docType));
    final allTicked =
        docs.isNotEmpty && docs.every((d) => _ticked.contains(d.id));

    String titleOf(PendingLegalDocument d) {
      final own = t.t('legal.doc.${d.docType}');
      // A type this build does not know: the server's title.
      return own.startsWith('legal.doc.')
          ? (d.title.isEmpty ? t.t('legal.doc.document') : d.title)
          : own;
    }

    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: colors.bg,
        appBar: AppTopBar(title: Text(t.t('legalAccept.title'))),
        body: SafeArea(
          top: false,
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenSide,
                    AppSpacing.md,
                    AppSpacing.screenSide,
                    AppSpacing.lg,
                  ),
                  children: [
                    Text(
                      t.t('legalAccept.intro'),
                      style: type.body.copyWith(
                        color: colors.textSecondary,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    for (final d in docs) ...[
                      _DocCard(
                        key: ValueKey('legal-accept-${d.docType}'),
                        title: titleOf(d),
                        version: t.t('legal.version', {'version': d.version}),
                        badge: d.updated ? t.t('legalAccept.updated') : null,
                        readLabel: t.t('legalAccept.read'),
                        checkLabel: t.t('legalAccept.check', {
                          'title': titleOf(d),
                        }),
                        checked: _ticked.contains(d.id),
                        onRead: () =>
                            context.push(AppRoutes.legalDoc(d.docType)),
                        onChanged: (v) => setState(() {
                          if (v) {
                            _ticked.add(d.id);
                          } else {
                            _ticked.remove(d.id);
                          }
                        }),
                      ),
                      const SizedBox(height: AppSpacing.md),
                    ],
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(top: AppSpacing.sm),
                        child: Text(
                          errorText(t, _error!),
                          key: const ValueKey('legal-accept-error'),
                          style: type.bodySmall.copyWith(color: colors.danger),
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                  AppSpacing.screenSide,
                  AppSpacing.md,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (!allTicked && docs.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                        child: Text(
                          t.t('legalAccept.hint'),
                          textAlign: TextAlign.center,
                          style: type.caption.copyWith(
                            color: colors.textSecondary,
                          ),
                        ),
                      ),
                    AppButton(
                      key: const ValueKey('legal-accept-button'),
                      label: t.t('legalAccept.accept'),
                      isLoading: _busy,
                      disabledHint: t.t('form.disabled.accept'),
                      isEnabled: allTicked,
                      onPressed: allTicked ? () => _accept(docs) : null,
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    AppPressable(
                      onTap: () => signOut(ref),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(
                          minHeight: AppSizes.touchTarget,
                        ),
                        child: Center(
                          child: Text(
                            t.t('legalAccept.signOut'),
                            textAlign: TextAlign.center,
                            style: type.bodySmall.copyWith(
                              color: colors.textSecondary,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One document: its title, a link to read it, and its own checkbox.
class _DocCard extends StatelessWidget {
  const _DocCard({
    required this.title,
    required this.version,
    required this.readLabel,
    required this.checkLabel,
    required this.checked,
    required this.onRead,
    required this.onChanged,
    super.key,
    this.badge,
  });

  final String title;
  final String version;
  final String? badge;
  final String readLabel;
  final String checkLabel;
  final bool checked;
  final VoidCallback onRead;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: checked ? colors.gold : colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: type.titleMedium.copyWith(color: colors.text)),
          const SizedBox(height: AppSpacing.xs),
          Text(
            badge == null ? version : '$version · $badge',
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
          Semantics(
            link: true,
            label: '$readLabel: $title',
            excludeSemantics: true,
            child: AppPressable(
              onTap: onRead,
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  minHeight: AppSizes.touchTarget,
                ),
                child: Row(
                  children: [
                    AppIcon(
                      AppIcons.descriptionOutlined,
                      size: AppSizes.iconSm,
                      color: colors.goldDark,
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Flexible(
                      child: Text(
                        readLabel,
                        style: type.bodySmall.copyWith(
                          color: colors.goldDark,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          ConsentCheckTile(
            value: checked,
            onChanged: onChanged,
            semanticLabel: checkLabel,
            content: Text(
              checkLabel,
              style: type.body.copyWith(color: colors.text),
            ),
          ),
        ],
      ),
    );
  }
}
