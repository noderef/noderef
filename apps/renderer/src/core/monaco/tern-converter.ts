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
 * Utility to convert Tern JSON definitions to TypeScript declaration format
 */

export interface TernDefinition {
  '!name'?: string;
  '!define'?: Record<string, any>;
  [key: string]: any;
}

const TYPE_MAPPINGS: Record<string, string> = {
  number: 'number',
  string: 'string',
  bool: 'boolean',
  Date: 'Date',
  any: 'any',
};

/**
 * Convert an array of Tern definitions to a single TypeScript declaration string
 */
export function convertTernToTs(defs: TernDefinition[]): string {
  return defs
    .map(def => {
      const name = def['!name'] || 'dynamic-dsl';
      let output = `// --- ${name} ---\n\n`;

      // Process !define section (internal types/interfaces)
      if (def['!define']) {
        output += Object.entries(def['!define'])
          .map(([typeName, typeDef]) => convertItemToTs(typeName, typeDef, true))
          .join('');
      }

      // Process global objects
      output += Object.entries(def)
        .filter(([key]) => !key.startsWith('!'))
        .filter(([_key, val]) => !val['!original']) // Skip duplicate entries marked by Tern
        .map(([key, val]) => convertItemToTs(key, val, false))
        .join('');

      return output;
    })
    .join('\n');
}

function convertItemToTs(name: string, def: any, isDefine: boolean): string {
  // If it starts with '+', it's a class/interface definition
  if (name.startsWith('+')) {
    return renderInterface(name.substring(1), def);
  }

  // If it has properties but no !type, it might be a namespace or a global object
  if (typeof def === 'object' && !def['!type']) {
    return isDefine
      ? renderInterface(name, def)
      : `declare const ${name}: {\n${renderProperties(def, '  ')}\n};\n\n`;
  }

  // If it has a !type
  if (def['!type']) {
    const tsType = parseTernType(def['!type']);
    const doc = renderDoc(def['!doc']);
    return isDefine
      ? `${doc}type ${name} = ${tsType};\n\n`
      : `${doc}declare const ${name}: ${tsType};\n\n`;
  }

  return '';
}

function renderInterface(name: string, def: any): string {
  const doc = renderDoc(def['!doc']);
  const props = renderProperties(def, '  ');
  return `${doc}interface ${name} {\n${props}\n}\n\n`;
}

function renderProperties(def: any, indent: string): string {
  return Object.entries(def)
    .filter(([key]) => !key.startsWith('!'))
    .filter(([_key, val]: [string, any]) => !val['!original']) // Skip duplicate entries marked by Tern
    .map(([key, val]: [string, any]) => {
      const doc = renderDoc(val['!doc'], indent);
      const tsType = val['!type'] ? parseTernType(val['!type']) : 'any';

      // Check if it's a function (Tern usually uses !type for functions)
      if (tsType.includes('=>') || tsType.includes('(')) {
        return `${doc}${indent}${key}${processMethodType(tsType)};\n`;
      }
      return `${doc}${indent}${key}: ${tsType};\n`;
    })
    .join('');
}

function parseTernType(type: string): string {
  if (!type) return 'any';

  // Handle function signatures: fn(arg1: type1, arg2: type2) -> returnType
  if (type.startsWith('fn(')) {
    const match = type.match(/^fn\((.*)\)(?:\s*->\s*(.*))?$/);
    if (match) {
      const args = match[1] || '';
      const ret = match[2] || 'void';
      return `(${parseArgs(args)}) => ${parseTernType(ret)}`;
    }
  }

  // Handle class links: +ClassName
  if (type.startsWith('+')) return type.substring(1);

  // Handle arrays: [type]
  if (type.startsWith('[') && type.endsWith(']')) {
    return `${parseTernType(type.substring(1, type.length - 1))}[]`;
  }

  return TYPE_MAPPINGS[type] || type;
}

function parseArgs(args: string): string {
  if (!args) return '';
  return args
    .split(',')
    .map(arg => {
      const parts = arg.trim().split(':');
      return parts.length === 2
        ? `${parts[0].trim()}: ${parseTernType(parts[1].trim())}`
        : arg.trim();
    })
    .join(', ');
}

function processMethodType(tsType: string): string {
  // If it's a function type (args) => ret, convert to method signature args: ret
  if (tsType.startsWith('(') && tsType.includes(') =>')) {
    const [args, ret] = tsType.split(') =>');
    return `${args}) : ${ret}`;
  }
  return `: ${tsType}`;
}

function renderDoc(doc?: string, indent = ''): string {
  if (!doc) return '';
  const lines = doc.split('\n');
  if (lines.length === 1) return `${indent}/** ${doc} */\n`;

  return `${indent}/**\n${lines.map(line => `${indent} * ${line}`).join('\n')}\n${indent} */\n`;
}
