import { Controller, Get, HttpStatus, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../common/dto/api-docs.decorators';
import { ErrorCode } from '../common/errors/error-code.enum';
import { buildOpenApiDocument } from './openapi.config';

class WidgetDto {
  @ApiProperty()
  name!: string;
}

@ApiTags('widgets')
@Controller('widgets')
class WidgetsController {
  @Get()
  @ApiEnvelopeResponse(WidgetDto, { isArray: true })
  list(): WidgetDto[] {
    return [];
  }

  @Post()
  @ApiEnvelopeResponse(WidgetDto, { status: HttpStatus.CREATED })
  @ApiErrors({ 409: [ErrorCode.IDEMPOTENCY_KEY_CONFLICT] })
  create(): WidgetDto {
    return { name: 'w' };
  }
}

@Controller('gadgets')
class GadgetsController {
  @Get()
  list(): string[] {
    return [];
  }
}

async function documentFor(...controllers: (new (...a: never[]) => unknown)[]) {
  const moduleRef = await Test.createTestingModule({ controllers }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.init();
  try {
    return buildOpenApiDocument(app);
  } finally {
    await app.close();
  }
}

describe('buildOpenApiDocument (packages/api-contract source, docs/01 §6.3/§7)', () => {
  it('documents 2xx bodies as named {data, meta?} envelopes and errors as ErrorResponseDto', async () => {
    const doc = await documentFor(WidgetsController);
    const schemas = doc.components?.schemas ?? {};

    expect(doc.servers).toEqual([{ url: '/api/v1' }]);
    const list = doc.paths['/widgets'].get;
    const create = doc.paths['/widgets'].post;
    expect(list?.operationId).toBe('list');
    expect(create?.operationId).toBe('create');
    expect(list?.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/WidgetListEnvelope' },
        },
      },
    });
    expect(create?.responses['201']).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/WidgetEnvelope' },
        },
      },
    });
    expect(schemas.WidgetListEnvelope).toMatchObject({
      required: ['data'],
      properties: {
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/WidgetDto' },
        },
        meta: { $ref: '#/components/schemas/ResponseMetaDto' },
      },
    });
    expect(create?.responses['409']).toMatchObject({
      description: expect.stringContaining('IDEMPOTENCY_KEY_CONFLICT'),
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorResponseDto' },
        },
      },
    });
    expect(schemas.ErrorCode).toMatchObject({
      type: 'string',
      enum: Object.values(ErrorCode),
    });
  });

  it('refuses duplicate operationIds (they name the generated client methods)', async () => {
    await expect(
      documentFor(WidgetsController, GadgetsController),
    ).rejects.toThrow(/Duplicate operationId "list"/);
  });
});
