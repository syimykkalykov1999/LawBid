import spec from '../../../../packages/api-contract/openapi.json';

/**
 * Test-only: builds the thinnest answer the API contract allows for an
 * operation, so a page can be opened against it. Arrays are empty, strings
 * empty, numbers 0, enums their first value; `nulls` turns every nullable
 * field into null, `optional` also fills the optional fields.
 */
type Schema = {
  $ref?: string;
  type?: string;
  nullable?: boolean;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  additionalProperties?: boolean | Schema;
  format?: string;
  minimum?: number;
};
type Doc = {
  paths: Record<string, Record<string, { responses?: Record<string, { content?: Record<string, { schema?: Schema }> }> }>>;
  components: { schemas: Record<string, Schema> };
};
const doc = spec as unknown as Doc;

export interface SampleMode {
  nulls: boolean;
  optional: boolean;
}

function build(s: Schema | undefined, mode: SampleMode, depth: number): unknown {
  if (!s || depth > 30) return null;
  if (s.$ref) return build(doc.components.schemas[s.$ref.split('/').pop()!], mode, depth + 1);
  if (s.nullable && mode.nulls) return null;
  if (s.enum?.length) return s.enum[0];
  if (s.allOf?.length) {
    const parts = s.allOf.map((p) => build(p, mode, depth + 1));
    return parts.every((p) => p && typeof p === 'object' && !Array.isArray(p)) ? Object.assign({}, ...parts) : parts[0];
  }
  const alt = s.oneOf?.[0] ?? s.anyOf?.[0];
  if (alt) return build(alt, mode, depth + 1);
  switch (s.type) {
    case 'array':
      return [];
    case 'integer':
    case 'number':
      return Math.max(0, s.minimum ?? 0);
    case 'boolean':
      return false;
    case 'string':
      if (s.format === 'date-time') return '2026-11-01T00:00:00.000Z';
      if (s.format === 'date') return '2026-11-01';
      if (s.format === 'uuid') return '00000000-0000-4000-8000-000000000000';
      return '';
    case 'object':
    case undefined: {
      const out: Record<string, unknown> = {};
      const req = new Set(s.required ?? []);
      for (const [k, v] of Object.entries(s.properties ?? {})) {
        if (req.has(k) || mode.optional) out[k] = build(v, mode, depth + 1);
      }
      if (!s.properties && s.additionalProperties && typeof s.additionalProperties === 'object') return {};
      return out;
    }
    default:
      return null;
  }
}

/** The success body of `METHOD path` (template path, e.g. `/admin/users/{id}`), or undefined. */
export function sampleResponse(method: string, path: string, mode: SampleMode): unknown {
  const op = doc.paths[path]?.[method.toLowerCase()];
  const ok = op?.responses?.['200'] ?? op?.responses?.['201'];
  const schema = ok?.content?.['application/json']?.schema;
  return schema ? build(schema, mode, 0) : undefined;
}
