import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/search/application/search_providers.dart';
import 'package:lawbid/features/search/data/search_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

/// The "@…" being typed right before the cursor, or null.
({int start, String query})? mentionQueryAt(TextEditingValue v) {
  final cursor = v.selection.baseOffset;
  if (cursor < 0 || cursor > v.text.length) return null;
  final before = v.text.substring(0, cursor);
  final m =
      RegExp(r'(?:^|[^A-Za-z0-9._@])@([A-Za-z0-9._]*)$').firstMatch(before);
  if (m == null) return null;
  final query = m.group(1)!;
  return (start: cursor - query.length - 1, query: query);
}

/// Replaces the "@…" before the cursor with "@username " and moves the
/// cursor after it.
TextEditingValue insertMention(TextEditingValue v, String username) {
  final q = mentionQueryAt(v);
  if (q == null) return v;
  final cursor = v.selection.baseOffset;
  final text = v.text.replaceRange(q.start, cursor, '@$username ');
  return TextEditingValue(
    text: text,
    selection: TextSelection.collapsed(offset: q.start + username.length + 2),
  );
}

/// OQ-042: while "@an…" is typed, people whose @username or name matches
/// appear under the field (attorneys and clients, like Instagram); a tap
/// puts "@username " into the text.
class MentionSuggestions extends ConsumerStatefulWidget {
  const MentionSuggestions({required this.controller, super.key});

  final TextEditingController controller;

  @override
  ConsumerState<MentionSuggestions> createState() => _MentionSuggestionsState();
}

class _MentionSuggestionsState extends ConsumerState<MentionSuggestions> {
  Timer? _debounce;
  String? _query;
  List<PersonRow> _people = const [];
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_changed);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_changed);
    _debounce?.cancel();
    super.dispose();
  }

  void _changed() {
    final q = mentionQueryAt(widget.controller.value)?.query;
    if (q == _query) return;
    _query = q;
    _debounce?.cancel();
    if (q == null || q.isEmpty) {
      if (_people.isNotEmpty) setState(() => _people = const []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 250), () => _search(q));
  }

  Future<void> _search(String q) async {
    final seq = ++_seq;
    try {
      final page = await ref
          .read(searchRepositoryProvider)
          .people(q, const SearchFilters());
      if (!mounted || seq != _seq || _query != q) return;
      setState(() => _people = page.items.take(6).toList());
    } on Object {
      if (mounted && seq == _seq) setState(() => _people = const []);
    }
  }

  void _pick(PersonRow p) {
    HapticFeedback.selectionClick();
    _query = null;
    widget.controller.value =
        insertMention(widget.controller.value, p.username);
    setState(() => _people = const []);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return AnimatedSize(
      duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
      alignment: Alignment.topCenter,
      child: _people.isEmpty
          ? const SizedBox(width: double.infinity)
          : Container(
              width: double.infinity,
              margin: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(AppRadii.card),
                border: Border.all(color: colors.border),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final p in _people)
                    Semantics(
                      button: true,
                      label: '@${p.username}',
                      excludeSemantics: true,
                      child: AppPressable(
                        onTap: () => _pick(p),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: AppSpacing.md,
                              vertical: AppSpacing.sm),
                          child: Row(
                            children: [
                              AppAvatar(
                                size: 36,
                                imageProvider: _avatar(p) == null
                                    ? null
                                    : NetworkImage(_avatar(p)!),
                                initials: _initials(p),
                              ),
                              const SizedBox(width: AppSpacing.md),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '@${p.username}',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: type.bodySmall.copyWith(
                                        color: colors.text,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    if (_name(p).isNotEmpty)
                                      Text(
                                        _name(p),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: type.caption.copyWith(
                                            color: colors.textSecondary),
                                      ),
                                  ],
                                ),
                              ),
                              if (_verified(p))
                                Icon(Icons.verified_rounded,
                                    size: 16, color: colors.info),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
    );
  }

  static String? _avatar(PersonRow p) =>
      p.attorney?.avatarUrl ?? p.client?.avatarUrl;

  static bool _verified(PersonRow p) =>
      p.attorney?.verified ?? p.client?.verified ?? false;

  static String _name(PersonRow p) => [
        p.attorney?.firstName ?? p.client?.firstName,
        p.attorney?.lastName ?? p.client?.lastName,
      ].whereType<String>().join(' ').trim();

  static String _initials(PersonRow p) {
    final n = _name(p);
    final src = n.isEmpty ? p.username : n;
    return src
        .split(' ')
        .where((w) => w.isNotEmpty)
        .take(2)
        .map((w) => w[0].toUpperCase())
        .join();
  }
}
