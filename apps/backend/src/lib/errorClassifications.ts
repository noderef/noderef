/**
 * Copyright 2025-2026 NodeRef
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

type StructuredErrorDetails = {
  statusCode?: number;
  errorKey?: string;
  briefSummary?: string;
  message?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function getNumericStatus(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{3}$/.test(trimmed)) {
      return Number(trimmed);
    }
  }

  return undefined;
}

function parseStructuredErrorText(rawText: string): StructuredErrorDetails | null {
  const text = rawText.trim();
  if (!text) {
    return null;
  }

  const parseObject = (value: unknown): StructuredErrorDetails | null => {
    const root = asRecord(value);
    if (!root) {
      return null;
    }

    const source = asRecord(root.error) ?? root;
    const statusCode = getNumericStatus(source.statusCode);
    const errorKey = getString(source.errorKey);
    const briefSummary = getString(source.briefSummary);
    const message = getString(source.message);

    if (!statusCode && !errorKey && !briefSummary && !message) {
      return null;
    }

    return { statusCode, errorKey, briefSummary, message };
  };

  try {
    const parsed = JSON.parse(text);
    const structured = parseObject(parsed);
    if (structured) {
      return structured;
    }
  } catch {
    // Ignore invalid JSON and fall back to embedded object parsing.
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      return parseObject(parsed);
    } catch {
      // Ignore invalid embedded JSON.
    }
  }

  return null;
}

function getStructuredErrorDetails(reason: unknown): StructuredErrorDetails | null {
  const record = asRecord(reason);
  if (!record) {
    return null;
  }

  const candidates = [
    record.error,
    record.response,
    asRecord(record.response)?.body,
    asRecord(asRecord(record.response)?.body)?.error,
    asRecord(record.response)?.error,
  ];

  for (const candidate of candidates) {
    const source = asRecord(candidate);
    if (!source) {
      continue;
    }

    const statusCode =
      getNumericStatus(source.statusCode) ??
      getNumericStatus(asRecord(source.error)?.statusCode) ??
      getNumericStatus(asRecord(source.body)?.statusCode) ??
      getNumericStatus(asRecord(asRecord(source.body)?.error)?.statusCode);
    const errorKey =
      getString(source.errorKey) ??
      getString(asRecord(source.error)?.errorKey) ??
      getString(asRecord(source.body)?.errorKey) ??
      getString(asRecord(asRecord(source.body)?.error)?.errorKey);
    const briefSummary =
      getString(source.briefSummary) ??
      getString(asRecord(source.error)?.briefSummary) ??
      getString(asRecord(source.body)?.briefSummary) ??
      getString(asRecord(asRecord(source.body)?.error)?.briefSummary);
    const message =
      getString(source.message) ??
      getString(asRecord(source.error)?.message) ??
      getString(asRecord(source.body)?.message) ??
      getString(asRecord(asRecord(source.body)?.error)?.message);

    if (statusCode || errorKey || briefSummary || message) {
      return { statusCode, errorKey, briefSummary, message };
    }
  }

  const textCandidates = [
    getString(record.message),
    getString(record.text),
    getString(asRecord(record.response)?.text),
    getString(asRecord(record.response)?.body),
  ];

  for (const text of textCandidates) {
    if (!text) {
      continue;
    }
    const parsed = parseStructuredErrorText(text);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function getErrorCode(reason: unknown): string | undefined {
  const code =
    (reason as any)?.code || (reason as any)?.error?.code || (reason as any)?.cause?.code;
  return typeof code === 'string' ? code : undefined;
}

function getErrorMessage(reason: unknown): string {
  const structured = getStructuredErrorDetails(reason);
  return (
    structured?.briefSummary ??
    structured?.message ??
    getString((reason as any)?.message) ??
    getString((reason as any)?.response?.text) ??
    ''
  );
}

function getErrorStatus(reason: unknown): number | undefined {
  const structured = getStructuredErrorDetails(reason);
  return (
    getNumericStatus((reason as any)?.status) ??
    getNumericStatus((reason as any)?.statusCode) ??
    getNumericStatus((reason as any)?.response?.status) ??
    getNumericStatus((reason as any)?.response?.statusCode) ??
    structured?.statusCode
  );
}

export function isTransientNetworkFailure(reason: unknown): boolean {
  const code = getErrorCode(reason);
  const message = getErrorMessage(reason);

  const transientCodes = [
    'ECONNREFUSED',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNRESET',
    'ETIMEDOUT',
  ];

  return (
    (code ? transientCodes.includes(code) : false) ||
    transientCodes.some(c => message.includes(c)) ||
    message.includes('connect ECONNREFUSED') ||
    getErrorStatus(reason) === 502 ||
    getErrorStatus(reason) === 503 ||
    getErrorStatus(reason) === 504
  );
}

export function isExpectedAuthFailure(reason: unknown): boolean {
  const status = getErrorStatus(reason);
  const message = getErrorMessage(reason);
  const structured = getStructuredErrorDetails(reason);
  const errorKey =
    structured?.errorKey ??
    (reason as any)?.error?.errorKey ??
    (reason as any)?.response?.body?.error?.errorKey ??
    (reason as any)?.response?.error?.errorKey;

  return (
    status === 401 ||
    status === 403 ||
    /login failed/i.test(message) ||
    /authentication failed/i.test(message) ||
    /login failed/i.test(structured?.briefSummary ?? '') ||
    /authentication failed/i.test(structured?.briefSummary ?? '') ||
    errorKey === 'Login failed'
  );
}

export function isExpectedUpstreamHttpFailure(reason: unknown): boolean {
  const status = getErrorStatus(reason);
  if (typeof status === 'number' && status >= 400 && status < 600) {
    return true;
  }

  const message = getErrorMessage(reason);
  return (
    /<html>/i.test(message) &&
    /(404 not found|401 unauthorized|403 forbidden|500 internal server error)/i.test(message)
  );
}
