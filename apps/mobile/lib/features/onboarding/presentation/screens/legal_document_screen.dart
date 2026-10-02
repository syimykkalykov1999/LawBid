import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/legal_document.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_providers.dart';

const _knownDocTypes = {
  'terms',
  'privacy',
  'disclaimer',
  'client_contact_sharing',
};

/// `/legal/:docType` — current Terms / Privacy / Disclaimer from
/// `/config/bootstrap` `legal_documents` (docs/01_FOUNDATION_AUTH.md
/// §10.2 H: "ссылки"). Renders `content_md` as readable text (headings
/// only — the seed ships plain placeholder copy); a document hosted at
/// `content_url` shows the link with a copy action (no in-app browser
/// dependency in this stage).
///
/// States: loading (bootstrap still in flight → skeleton), empty (no such
/// document published), error/offline (bootstrap failed → Retry).
class LegalDocumentScreen extends ConsumerStatefulWidget {
  const LegalDocumentScreen({required this.docType, super.key});

  final String docType;

  @override
  ConsumerState<LegalDocumentScreen> createState() =>
      _LegalDocumentScreenState();
}

class _LegalDocumentScreenState extends ConsumerState<LegalDocumentScreen> {
  bool _refreshing = false;

  Future<void> _retry() async {
    setState(() => _refreshing = true);
    await ref
        .read(featureFlagsControllerProvider.notifier)
        .refreshInBackground();
    if (mounted) setState(() => _refreshing = false);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final docs = ref
        .watch(featureFlagsControllerProvider.select((s) => s.legalDocuments));
    final lang = ref.watch(languageControllerProvider).value ?? AppLanguage.en;
    final doc = pickLegalDocument(docs, widget.docType, lang.name);

    final Widget body;
    if (_refreshing) {
      body = ListView(
        padding: const EdgeInsets.all(AppSpacing.screenSide),
        children: [
          for (var i = 0; i < 8; i++) ...[
            AppSkeleton(width: i.isEven ? null : 220),
            const SizedBox(height: AppSpacing.md),
          ],
        ],
      );
    } else if (docs.isEmpty) {
      // Bootstrap never arrived (offline or failed).
      body = AppOfflineState(
        title: t.t('offline.title'),
        message: t.t('legal.unavailable'),
        action: SizedBox(
          width: AppSizes.stateActionWidth,
          child: AppButton(
            label: t.t('error.retry'),
            icon: AppIcons.refreshRounded,
            variant: AppButtonVariant.secondary,
            height: AppSizes.touchTarget,
            onPressed: () => unawaited(_retry()),
          ),
        ),
      );
    } else if (doc == null) {
      body = AppEmptyState(
        icon: AppIcons.descriptionOutlined,
        message: t.t('legal.notFound'),
      );
    } else {
      body = ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.xxl,
        ),
        children: [
          Text(
            t.t('legal.version', {'version': doc.version}),
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.lg),
          if (doc.contentMd != null)
            for (final block in doc.contentMd!.split(RegExp(r'\n{2,}')))
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: block.startsWith('#')
                    ? Semantics(
                        header: true,
                        child: Text(
                          block.replaceFirst(RegExp(r'^#+\s*'), ''),
                          style: typography.titleMedium
                              .copyWith(color: colors.text),
                        ),
                      )
                    : SelectableText(
                        block,
                        style: typography.body.copyWith(color: colors.text),
                      ),
              ),
          if (doc.contentUrl != null)
            AppListRow(
              icon: AppIcons.linkRounded,
              label: doc.contentUrl!,
              trailingText: t.t('legal.copyLink'),
              showChevron: false,
              onTap: () async {
                await Clipboard.setData(ClipboardData(text: doc.contentUrl!));
                if (context.mounted) {
                  showAppSnackBar(context, t.t('legal.linkCopied'));
                }
              },
            ),
        ],
      );
    }

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(
          t.t(
            _knownDocTypes.contains(widget.docType)
                ? 'legal.doc.${widget.docType}'
                : 'legal.doc.document',
          ),
        ),
        leading: AppBackButton(
          semanticLabel: t.t('common.close'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(top: false, child: body),
    );
  }
}
