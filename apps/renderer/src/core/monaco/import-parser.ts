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
 * Utilities for parsing Alfresco-style <import> tags in JavaScript code
 */

export interface ImportResource {
  /** The full import statement as it appears in code */
  raw: string;
  /** The resource path/identifier */
  resource: string;
  /** The type of import */
  type: 'path' | 'noderef' | 'classpath';
}

/**
 * Parse <import resource="..."> tags from JavaScript code
 * Supports:
 * - Name-based paths: <import resource="/Company Home/Data Dictionary/Scripts/library.js">
 * - NodeRef: <import resource="workspace://SpacesStore/6f73de1b-d3b4-11db-80cb-112e6c2ea048">
 * - Classpath: <import resource="classpath:alfresco/extension/myutils.js">
 */
/**
 * Regex pattern source for matching <import> tags
 * Captures the resource path in group 1
 */
export const IMPORT_TAG_REGEX_SOURCE = '<import\\s+resource\\s*=\\s*["\']([^"\']+)["\']\\s*\\/?>';

/**
 * Parse <import resource="..."> tags from JavaScript code
 * Supports:
 * - Name-based paths: <import resource="/Company Home/Data Dictionary/Scripts/library.js">
 * - NodeRef: <import resource="workspace://SpacesStore/6f73de1b-d3b4-11db-80cb-112e6c2ea048">
 * - Classpath: <import resource="classpath:alfresco/extension/myutils.js">
 */
export function parseImportTags(code: string): ImportResource[] {
  const imports: ImportResource[] = [];

  // Regex to match <import resource="..." /> or <import resource="...">
  // Handles single quotes, double quotes, and self-closing tags
  const importRegex = new RegExp(IMPORT_TAG_REGEX_SOURCE, 'gi');

  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(code)) !== null) {
    const raw = match[0];
    const resource = match[1];

    // Determine import type
    let type: ImportResource['type'];
    if (resource.startsWith('workspace://') || resource.startsWith('spacesstore://')) {
      type = 'noderef';
    } else if (resource.startsWith('classpath:')) {
      type = 'classpath';
    } else {
      type = 'path';
    }

    imports.push({ raw, resource, type });
  }

  return imports;
}

/**
 * Parse JSDoc comments to extract parameter types and return types
 */
interface ParsedJSDoc {
  description: string;
  params: Array<{ name: string; type: string; description: string }>;
  returns: { type: string; description: string } | null;
}

function parseJSDoc(jsdoc: string): ParsedJSDoc {
  const result: ParsedJSDoc = {
    description: '',
    params: [],
    returns: null,
  };

  // Remove /** and */ and split by lines
  const lines = jsdoc
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map(line => line.replace(/^\s*\*\s?/, '').trim())
    .filter(line => line.length > 0);

  let currentSection: 'description' | 'other' = 'description';
  const descriptionLines: string[] = [];

  for (const line of lines) {
    // @param {type} name - description
    const paramMatch = line.match(/@param\s+\{([^}]+)\}\s+(\w+)\s*-?\s*(.*)/);
    if (paramMatch) {
      currentSection = 'other';
      result.params.push({
        name: paramMatch[2],
        type: paramMatch[1],
        description: paramMatch[3],
      });
      continue;
    }

    // @returns {type} description or @return {type} description
    const returnsMatch = line.match(/@returns?\s+\{([^}]+)\}\s*(.*)/);
    if (returnsMatch) {
      currentSection = 'other';
      result.returns = {
        type: returnsMatch[1],
        description: returnsMatch[2],
      };
      continue;
    }

    // Collect description lines before any @tags
    if (currentSection === 'description' && !line.startsWith('@')) {
      descriptionLines.push(line);
    }
  }

  result.description = descriptionLines.join(' ');
  return result;
}

/**
 * Extract function declarations from JavaScript code
 * Returns an array of function signatures with JSDoc comments
 */
export function extractFunctionSignatures(code: string): string[] {
  const signatures: string[] = [];

  // Match function declarations with optional JSDoc comments
  // This regex matches:
  // 1. Optional JSDoc comment (/** ... */)
  // 2. function keyword
  // 3. function name
  // 4. parameters
  const functionRegex = /(\/\*\*[\s\S]*?\*\/\s*)?function\s+(\w+)\s*\(([^)]*)\)/g;

  let match: RegExpExecArray | null;
  while ((match = functionRegex.exec(code)) !== null) {
    const jsdocRaw = match[1] || '';
    const functionName = match[2];
    const params = match[3];

    if (jsdocRaw) {
      // Parse JSDoc for better type information
      const parsed = parseJSDoc(jsdocRaw);

      // Build parameter list with types
      const paramParts = params
        .split(',')
        .map(p => p.trim())
        .filter(p => p);
      const typedParams = paramParts.map(paramName => {
        const paramInfo = parsed.params.find(p => p.name === paramName);
        return paramInfo ? `${paramName}: ${paramInfo.type}` : `${paramName}: any`;
      });

      const returnType = parsed.returns?.type || 'any';

      // Build JSDoc comment for TypeScript
      const jsdocLines = ['/**'];
      if (parsed.description) {
        jsdocLines.push(` * ${parsed.description}`);
      }
      for (const param of parsed.params) {
        jsdocLines.push(` * @param ${param.name} ${param.description}`);
      }
      if (parsed.returns) {
        jsdocLines.push(` * @returns ${parsed.returns.description}`);
      }
      jsdocLines.push(' */');

      signatures.push(
        `${jsdocLines.join('\n')}\ndeclare function ${functionName}(${typedParams.join(', ')}): ${returnType};`
      );
    } else {
      // No JSDoc, use simple declaration
      signatures.push(`declare function ${functionName}(${params}): any;`);
    }
  }

  // Also match const/var/let function expressions
  const arrowFunctionRegex =
    /(\/\*\*[\s\S]*?\*\/\s*)?(?:const|var|let)\s+(\w+)\s*=\s*(?:function\s*)?\(([^)]*)\)\s*(?:=>|{)/g;

  while ((match = arrowFunctionRegex.exec(code)) !== null) {
    const jsdocRaw = match[1] || '';
    const functionName = match[2];
    const params = match[3];

    if (jsdocRaw) {
      // Parse JSDoc for better type information
      const parsed = parseJSDoc(jsdocRaw);

      // Build parameter list with types
      const paramParts = params
        .split(',')
        .map(p => p.trim())
        .filter(p => p);
      const typedParams = paramParts.map(paramName => {
        const paramInfo = parsed.params.find(p => p.name === paramName);
        return paramInfo ? `${paramName}: ${paramInfo.type}` : `${paramName}: any`;
      });

      const returnType = parsed.returns?.type || 'any';

      // Build JSDoc comment for TypeScript
      const jsdocLines = ['/**'];
      if (parsed.description) {
        jsdocLines.push(` * ${parsed.description}`);
      }
      for (const param of parsed.params) {
        jsdocLines.push(` * @param ${param.name} ${param.description}`);
      }
      if (parsed.returns) {
        jsdocLines.push(` * @returns ${parsed.returns.description}`);
      }
      jsdocLines.push(' */');

      signatures.push(
        `${jsdocLines.join('\n')}\ndeclare const ${functionName}: (${typedParams.join(', ')}) => ${returnType};`
      );
    } else {
      // No JSDoc, use simple declaration
      signatures.push(`declare const ${functionName}: (${params}) => any;`);
    }
  }

  return signatures;
}

/**
 * Extract global variable/constant declarations from JavaScript code
 */
export function extractGlobalDeclarations(code: string): string[] {
  const declarations: string[] = [];

  // Match top-level var/let/const declarations (not inside functions)
  // Simple approach: look for var/let/const at start of line or after semicolon
  const varRegex = /(?:^|;|\n)\s*(var|let|const)\s+(\w+)\s*=/gm;

  let match: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((match = varRegex.exec(code)) !== null) {
    const varName = match[2];

    // Skip if already seen or if it looks like it's inside a function
    if (seen.has(varName)) continue;
    seen.add(varName);

    // Use 'const' for TypeScript declarations regardless of original type
    declarations.push(`declare const ${varName}: any;`);
  }

  return declarations;
}

/**
 * Extract @typedef declarations from JSDoc and convert to TypeScript interfaces
 */
export function extractTypedefDeclarations(code: string): string[] {
  const typedefs: string[] = [];

  // Match @typedef blocks in JSDoc comments
  const typedefRegex = /\/\*\*[\s\S]*?@typedef\s+\{(\w+)\}\s+(\w+)([\s\S]*?)\*\//g;

  let match: RegExpExecArray | null;
  while ((match = typedefRegex.exec(code)) !== null) {
    const typeName = match[2];
    const typedefBlock = match[0];

    // Extract @property declarations
    const properties: Array<{ name: string; type: string; description: string }> = [];
    const propertyRegex = /@property\s+\{([^}]+)\}\s+(\w+)\s*-?\s*(.*)/g;

    let propMatch: RegExpExecArray | null;
    while ((propMatch = propertyRegex.exec(typedefBlock)) !== null) {
      properties.push({
        type: propMatch[1],
        name: propMatch[2],
        description: propMatch[3],
      });
    }

    if (properties.length > 0) {
      // Generate TypeScript interface
      const interfaceLines = [`interface ${typeName} {`];
      for (const prop of properties) {
        const comment = prop.description ? `  /** ${prop.description} */\n` : '';
        interfaceLines.push(`${comment}  ${prop.name}: ${prop.type};`);
      }
      interfaceLines.push('}');

      typedefs.push(interfaceLines.join('\n'));
    }
  }

  return typedefs;
}

/**
 * Convert JavaScript code to TypeScript declarations
 * This provides basic IntelliSense support for imported scripts
 */
export function convertToTypeScriptDeclarations(code: string, moduleName: string): string {
  const typedefs = extractTypedefDeclarations(code);
  const functions = extractFunctionSignatures(code);
  const globals = extractGlobalDeclarations(code);

  const allDeclarations = [...typedefs, ...functions, ...globals];

  if (allDeclarations.length === 0) {
    return `// No declarations found in ${moduleName}`;
  }

  return `// Auto-generated declarations for ${moduleName}\n\n${allDeclarations.join('\n\n')}`;
}

/**
 * Remove import tags from code (for cleaner error-free editing)
 * Note: Import tags are XML-style and are typically removed by Alfresco's
 * RhinoScriptProcessor before execution
 */
export function stripImportTags(code: string): string {
  return code.replace(new RegExp(IMPORT_TAG_REGEX_SOURCE, 'gi'), '');
}
