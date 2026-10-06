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
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/legal/application/legal_providers.dart';
import 'package:lawbid/features/legal/presentation/widgets/legal_markdown.dart';

const _knownDocTypes = {
  'terms',
  'privacy',
  'disclaimer',
  'client_contact_sharing',
  'attorney_agreement',
  'client_agreement',
  'eula',
  'refund',
  'cookies',
  'third_party_services',
  'partner_terms',
  'dmca_policy',
};

/// `/legal/:docType` — the current text of any legal document (terms,
/// privacy, the role agreements, EULA, refunds, cookies, ...) from
/// `GET /legal/documents/:type` in the user's language; the bootstrap copy
/// (`/config/bootstrap` `legal_documents`) of the four old ones is the
/// fallback. The Markdown the owner writes in the admin is rendered by
/// [LegalMarkdown]; a document hosted at `content_url` shows the link with
/// a copy action.
///
/// States: loading (skeleton), empty (no such document published),
/// error/offline (Retry).
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
    ref.invalidate(legalDocumentTextProvider(widget.docType));
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
    final docs = ref.watch(
      featureFlagsControllerProvider.select((s) => s.legalDocuments),
    );
    final lang = ref.watch(languageControllerProvider).value ?? AppLanguage.en;
    final bootstrapDoc = pickLegalDocument(docs, widget.docType, lang.name);
    // Owner 2026-10-05: the text comes from GET /legal/documents/:type (all
    // twelve documents, in the user's language); the bootstrap copy of the
    // four old ones is the fallback while that loads or when it fails.
    final remote = ref.watch(legalDocumentTextProvider(widget.docType));
    final fallback = bootstrapDoc != null &&
            (bootstrapDoc.contentMd != null || bootstrapDoc.contentUrl != null)
        ? bootstrapDoc
        : null;
    final remoteText = remote.value;
    final version = remoteText?.version ?? fallback?.version;
    final markdown = remoteText?.contentMd ?? fallback?.contentMd;
    final contentUrl = remoteText == null ? fallback?.contentUrl : null;
    final hasContent = remoteText != null || fallback != null;
    final notPublished = remote.hasError &&
        remote.error is ApiException &&
        (remote.error! as ApiException).code == ApiErrorCodes.notFound;

    final Widget body;
    if (_refreshing || (remote.isLoading && !hasContent)) {
      body = ListView(
        padding: const EdgeInsets.all(AppSpacing.screenSide),
        children: [
          for (var i = 0; i < 8; i++) ...[
            AppSkeleton(width: i.isEven ? null : 220),
            const SizedBox(height: AppSpacing.md),
          ],
        ],
      );
    } else if (!hasContent && notPublished) {
      body = AppEmptyState(
        icon: AppIcons.descriptionOutlined,
        message: t.t('legal.notFound'),
      );
    } else if (!hasContent) {
      // Offline or failed, and no bootstrap copy either.
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
            t.t('legal.version', {'version': version ?? ''}),
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.lg),
          if (markdown != null) LegalMarkdown(markdown),
          if (contentUrl != null)
            AppListRow(
              icon: AppIcons.linkRounded,
              label: contentUrl,
              trailingText: t.t('legal.copyLink'),
              showChevron: false,
              onTap: () async {
                await Clipboard.setData(ClipboardData(text: contentUrl));
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
