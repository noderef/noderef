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

import {
  IconFile,
  IconFileText,
  IconFileTypePdf,
  IconFileTypeDoc,
  IconFileTypeDocx,
  IconFileTypeXls,
  IconFileTypeCsv,
  IconFileTypePpt,
  IconFileTypeHtml,
  IconFileTypeCss,
  IconFileTypeJs,
  IconFileTypeJsx,
  IconFileTypeTs,
  IconFileTypeTsx,
  IconFileTypePhp,
  IconFileTypeSql,
  IconFileTypeSvg,
  IconFileTypeTxt,
  IconFileTypeVue,
  IconFileTypeXml,
  IconFileTypeZip,
  IconFileTypeJpg,
  IconFileTypePng,
  IconFileTypeBmp,
  IconFileTypeRs,
  IconPhoto,
  IconFileZip,
  IconFileCode,
  IconVideo,
  IconMusic,
} from '@tabler/icons-react';

const EXACT_MIME_ICON_MAP: Record<string, React.ComponentType<any>> = {
  'application/pdf': IconFileTypePdf,
  'application/msword': IconFileTypeDoc,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': IconFileTypeDocx,
  'application/vnd.oasis.opendocument.text': IconFileTypeDoc,
  'application/vnd.ms-excel': IconFileTypeXls,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': IconFileTypeXls,
  'application/vnd.oasis.opendocument.spreadsheet': IconFileTypeXls,
  'text/csv': IconFileTypeCsv,
  'application/vnd.ms-powerpoint': IconFileTypePpt,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': IconFileTypePpt,
  'application/vnd.oasis.opendocument.presentation': IconFileTypePpt,
  'text/html': IconFileTypeHtml,
  'text/css': IconFileTypeCss,
  'application/javascript': IconFileTypeJs,
  'text/javascript': IconFileTypeJs,
  'text/jsx': IconFileTypeJsx,
  'application/typescript': IconFileTypeTs,
  'text/x-typescript': IconFileTypeTs,
  'text/tsx': IconFileTypeTsx,
  'application/sql': IconFileTypeSql,
  'text/x-sql': IconFileTypeSql,
  'application/x-httpd-php': IconFileTypePhp,
  'text/x-php': IconFileTypePhp,
  'text/x-rustsrc': IconFileTypeRs,
  'text/x-rust': IconFileTypeRs,
  'text/x-vue': IconFileTypeVue,
  'application/vue': IconFileTypeVue,
  'text/plain': IconFileTypeTxt,
  'text/markdown': IconFileTypeTxt,
  'application/x-yaml': IconFileTypeTxt,
  'text/yaml': IconFileTypeTxt,
  'text/x-yaml': IconFileTypeTxt,
  'application/xml': IconFileTypeXml,
  'text/xml': IconFileTypeXml,
  'application/rss+xml': IconFileTypeXml,
  'image/svg+xml': IconFileTypeSvg,
  'image/jpeg': IconFileTypeJpg,
  'image/jpg': IconFileTypeJpg,
  'image/png': IconFileTypePng,
  'image/bmp': IconFileTypeBmp,
  'text/x-sqlite': IconFileTypeSql,
  'application/zip': IconFileTypeZip,
  'application/x-zip-compressed': IconFileTypeZip,
  'application/x-7z-compressed': IconFileTypeZip,
  'application/x-tar': IconFileTypeZip,
  'application/gzip': IconFileTypeZip,
  'application/x-bzip2': IconFileTypeZip,
  'application/vnd.rar': IconFileZip,
};

/**
 * Get appropriate file icon based on mimetype
 * Falls back to generic file icon if no specific match
 */
export function getFileIconByMimeType(mimeType?: string): React.ComponentType<any> {
  if (!mimeType) {
    return IconFile;
  }
  const normalized = mimeType.toLowerCase();

  const exactMatch = EXACT_MIME_ICON_MAP[normalized];
  if (exactMatch) {
    return exactMatch;
  }

  if (normalized.endsWith('+xml')) {
    return IconFileTypeXml;
  }
  if (normalized.endsWith('+json')) {
    return IconFileCode;
  }

  if (normalized.startsWith('text/')) {
    return IconFileText;
  }

  if (normalized.startsWith('image/')) {
    return IconPhoto;
  }

  if (normalized.startsWith('video/')) {
    return IconVideo;
  }

  if (normalized.startsWith('audio/')) {
    return IconMusic;
  }

  if (
    normalized.includes('zip') ||
    normalized.includes('tar') ||
    normalized.includes('rar') ||
    normalized.includes('7z') ||
    normalized.includes('gzip')
  ) {
    return IconFileZip;
  }

  if (
    normalized.includes('json') ||
    normalized.includes('javascript') ||
    normalized.includes('typescript') ||
    normalized.includes('html') ||
    normalized.includes('css')
  ) {
    return IconFileCode;
  }

  return IconFile;
}
