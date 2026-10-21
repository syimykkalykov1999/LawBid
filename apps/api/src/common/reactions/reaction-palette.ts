import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ErrorCode } from '../errors/error-code.enum';

/**
 * Owner 2026-10-21 (inbox 26b/26c, Telegram): the reactions of channels and
 * groups. «All» = this whole palette; «Selected» = the ones the admins
 * ticked; «Off» = none. The first six were the channels' fixed set.
 */
export const REACTION_PALETTE = [
  '👍',
  '❤️',
  '🔥',
  '👏',
  '😮',
  '🙏',
  '👎',
  '😁',
  '🤔',
  '🤯',
  '😢',
  '🎉',
  '🤩',
  '👌',
  '😍',
  '💯',
  '🤣',
  '⚡',
  '🏆',
  '💔',
  '👀',
  '🤝',
  '✍️',
  '😎',
] as const;

export const REACTION_MODES = ['all', 'some', 'off'] as const;
export type ReactionMode = (typeof REACTION_MODES)[number];

/** The stored mode, defaulting anything unknown to «all». */
export function reactionMode(value: string | null | undefined): ReactionMode {
  return (REACTION_MODES as readonly string[]).includes(value ?? '')
    ? (value as ReactionMode)
    : 'all';
}

/** The emojis a reader may put under [mode] / [allowed]. */
export function reactionChoices(
  mode: string | null | undefined,
  allowed: readonly string[],
): string[] {
  switch (reactionMode(mode)) {
    case 'off':
      return [];
    case 'some':
      return REACTION_PALETTE.filter((e) => allowed.includes(e));
    default:
      return [...REACTION_PALETTE];
  }
}

/** 403 when [emoji] is not open under the group's / channel's setting. */
export function assertReactionAllowed(
  mode: string | null | undefined,
  allowed: readonly string[],
  emoji: string,
): void {
  if (reactionChoices(mode, allowed).includes(emoji)) return;
  throw new ForbiddenException({
    code: ErrorCode.FORBIDDEN,
    message:
      reactionMode(mode) === 'off'
        ? 'Reactions are off here.'
        : 'This reaction is not allowed here.',
  });
}

/**
 * The «Selected» list to store: palette order, no repeats; at least one
 * when the mode is «some» (400 otherwise).
 */
export function cleanAllowed(
  mode: ReactionMode,
  list: readonly string[] | undefined,
): string[] {
  const out = REACTION_PALETTE.filter((e) => (list ?? []).includes(e));
  if (mode === 'some' && out.length === 0) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Pick at least one reaction.',
      details: { field: 'reactionsAllowed' },
    });
  }
  return out;
}
