export interface ApiSuccessBody<T> {
  data: T;
  meta?: { nextCursor?: string | null } & Record<string, unknown>;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}
