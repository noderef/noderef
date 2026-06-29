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

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { SCHEMA_NODE_SOURCE_HANDLE, SCHEMA_NODE_TARGET_HANDLE } from './handles';
import { SCHEMA_NODE_MAX_DISPLAYED_PROPS } from './nodeDimensions';
import type { SchemaNodeData } from './types';
import './nodeStyles.css';

type SchemaNodeKind = 'type' | 'aspect';

const NODE_CLASS: Record<SchemaNodeKind, string> = {
  type: 'model-explorer-type-node',
  aspect: 'model-explorer-aspect-node',
};

const KIND_LABEL_KEY: Record<
  SchemaNodeKind,
  'modelExplorerLegendType' | 'modelExplorerLegendAspect'
> = {
  type: 'modelExplorerLegendType',
  aspect: 'modelExplorerLegendAspect',
};

function SchemaNode({ data, selected, kind }: NodeProps & { kind: SchemaNodeKind }) {
  const { t } = useTranslation('submenu');
  const record = (data as SchemaNodeData).record;
  const props = record.properties.slice(0, SCHEMA_NODE_MAX_DISPLAYED_PROPS);
  const remaining = record.properties.length - props.length;
  const className = NODE_CLASS[kind];

  return (
    <div className={`${className}${selected ? ' selected' : ''}`}>
      <Handle
        id={SCHEMA_NODE_TARGET_HANDLE}
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="model-explorer-handle model-explorer-handle-hidden"
      />
      <div className="model-explorer-node-kind">{t(KIND_LABEL_KEY[kind])}</div>
      <div className="model-explorer-node-title">{record.label}</div>
      {props.map(prop => (
        <div key={prop.name} className="model-explorer-prop-row">
          <span className="model-explorer-prop-name">
            {prop.mandatory ? '* ' : ''}
            {prop.name}
          </span>
          <span className="model-explorer-prop-type">
            {prop.dataType || t('modelExplorerNone')}
          </span>
        </div>
      ))}
      {remaining > 0 && (
        <div className="model-explorer-more-badge">
          {t('modelExplorerMoreProperties', { count: remaining })}
        </div>
      )}
      <Handle
        id={SCHEMA_NODE_SOURCE_HANDLE}
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="model-explorer-handle model-explorer-handle-hidden"
      />
    </div>
  );
}

export function TypeNode(props: NodeProps) {
  return <SchemaNode {...props} kind="type" />;
}

export function AspectNode(props: NodeProps) {
  return <SchemaNode {...props} kind="aspect" />;
}
