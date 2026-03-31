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

/**
 * Web password gate helpers for Docker/SERVE_STATIC deployments.
 * Centralizes activation, password verification, and cookie session handling.
 */

import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';

const SESSION_COOKIE_NAME = 'noderef_web_auth';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;
const SESSION_SIGNING_CONTEXT = 'noderef-web-password-v1';

function getConfiguredWebPassword(): string {
  return process.env.WEB_PASSWORD?.trim() ?? '';
}

/**
 * Gate is active only in static web mode with a non-empty WEB_PASSWORD.
 */
export function isWebPasswordGateActive(): boolean {
  return process.env.SERVE_STATIC === '1' && getConfiguredWebPassword().length > 0;
}

function getSessionSigningSecret(): Buffer {
  const password = getConfiguredWebPassword();
  return createHash('sha256').update(`${SESSION_SIGNING_CONTEXT}:${password}`).digest();
}

function hashForSafeCompare(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function safeCompare(left: string, right: string): boolean {
  return timingSafeEqual(hashForSafeCompare(left), hashForSafeCompare(right));
}

/**
 * Constant-time compare for submitted web password.
 */
export function isWebPasswordValid(submittedPassword: string): boolean {
  const configuredPassword = getConfiguredWebPassword();
  if (!configuredPassword) {
    return false;
  }
  return safeCompare(submittedPassword, configuredPassword);
}

function parseCookie(headerValue: string | undefined, cookieName: string): string | null {
  if (!headerValue) {
    return null;
  }

  const pairs = headerValue.split(';');
  for (const pair of pairs) {
    const [namePart, ...valueParts] = pair.trim().split('=');
    if (!namePart || valueParts.length === 0) {
      continue;
    }
    if (namePart === cookieName) {
      return decodeURIComponent(valueParts.join('='));
    }
  }

  return null;
}

function buildSessionToken(expiresAt: number): string {
  const payload = String(expiresAt);
  const signature = createHmac('sha256', getSessionSigningSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function isSessionTokenValid(token: string): boolean {
  const [expiresAtPart, signaturePart, ...rest] = token.split('.');
  if (!expiresAtPart || !signaturePart || rest.length > 0) {
    return false;
  }

  const expiresAt = Number(expiresAtPart);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }

  const expectedSignature = createHmac('sha256', getSessionSigningSecret())
    .update(expiresAtPart)
    .digest('base64url');

  return safeCompare(signaturePart, expectedSignature);
}

function isSecureRequest(req: Request): boolean {
  if (req.secure) {
    return true;
  }

  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string') {
    return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
  }

  if (Array.isArray(forwardedProto) && forwardedProto.length > 0) {
    return forwardedProto[0].trim().toLowerCase() === 'https';
  }

  return false;
}

/**
 * Check if the request has a valid signed web password session cookie.
 */
export function hasValidWebPasswordSession(req: Request): boolean {
  if (!isWebPasswordGateActive()) {
    return false;
  }

  const token = parseCookie(req.headers.cookie, SESSION_COOKIE_NAME);
  if (!token) {
    return false;
  }

  return isSessionTokenValid(token);
}

/**
 * Issue/refresh the web password session cookie.
 */
export function setWebPasswordSessionCookie(req: Request, res: Response): void {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = buildSessionToken(expiresAt);
  const cookieParts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];

  if (isSecureRequest(req)) {
    cookieParts.push('Secure');
  }

  res.setHeader('Set-Cookie', cookieParts.join('; '));
}
