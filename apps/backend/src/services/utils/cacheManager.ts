/**
 * Copyright 2025 NodeRef
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
 * Generic in-memory cache manager
 * Reusable caching layer that can be used across different domains
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface CacheOptions {
  enabled?: boolean;
  ttl?: number; // Time-to-live in milliseconds
}

/**
 * Generic cache manager
 */
export class CacheManager<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private enabled: boolean;
  private ttl?: number;

  constructor(options: CacheOptions = {}) {
    this.enabled = options.enabled ?? false;
    this.ttl = options.ttl;
  }

  /**
   * Get cached value if available and not expired
   */
  get(key: string): T | null {
    if (!this.enabled) {
      return null;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (this.ttl && Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Store value in cache
   */
  set(key: string, data: T): void {
    if (!this.enabled) {
      return;
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate entries matching a pattern
   */
  invalidatePattern(pattern: RegExp): void {
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    enabled: boolean;
    size: number;
    entries: Array<{ key: string; timestamp: number }>;
  } {
    return {
      enabled: this.enabled,
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        timestamp: entry.timestamp,
      })),
    };
  }

  /**
   * Enable cache
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable cache
   */
  disable(): void {
    this.enabled = false;
    this.clear();
  }
}
