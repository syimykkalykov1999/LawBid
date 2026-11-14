import { BadRequestException } from '@nestjs/common';
import { OmitType } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { IsOptional, IsString, IsUUID, validate } from 'class-validator';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { CreatePostDto } from '../posts/dto/posts.dto';
import { UpdateAttorneyProfileDto } from '../profiles/dto/attorney-profile.dto';
import type { REQUEST_KINDS } from './assistants.dto';

/**
 * R2B-2 (detective R2, 14.11): what an assistant files is checked with the
 * same class-validator rules as the attorney's own request (the global
 * ValidationPipe: whitelist + forbidNonWhitelisted) — at filing and again at
 * approval, so an approved request never writes what the API forbids.
 */
export class AssistantCommentPayload {
  @IsUUID() postId!: string;
  @IsString() body!: string;
  @IsOptional() @IsUUID() parentId?: string;
}

export class AssistantCaseCommentPayload {
  @IsUUID() caseId!: string;
  @IsString() body!: string;
  @IsOptional() @IsUUID() parentId?: string;
}

/** What the app's profile screen sends for an assistant (names, bio, firms,
 * languages), with the profile's own rules. The public @username is not an
 * assistant's to change: it is the attorney's identity and is never sent
 * from the assistant's screen. */
export class AssistantProfileEditPayload extends OmitType(
  UpdateAttorneyProfileDto,
  ['username'] as const,
) {}

type Kind = (typeof REQUEST_KINDS)[number];

const SHAPES: Record<Kind, new () => object> = {
  post: CreatePostDto,
  comment: AssistantCommentPayload,
  case_comment: AssistantCaseCommentPayload,
  profile_edit: AssistantProfileEditPayload,
};

/** The payload as the target DTO (validated, transformed), or 400. */
export async function checkedPayload<T extends object = object>(
  kind: Kind,
  raw: unknown,
): Promise<T> {
  const plain: Record<string, unknown> =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  if (kind === 'post') {
    // Owner 2026-10-18: a post's title and text may be left out.
    plain.title ??= '';
    plain.body ??= '';
  }
  const value = plainToInstance(SHAPES[kind], plain) as T;
  const errors = await validate(value, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'The request is invalid.',
      details: { field: 'payload', fields: errors.map((e) => e.property) },
    });
  }
  return value;
}
