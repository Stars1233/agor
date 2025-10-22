/**
 * Custom React Flow node components for board objects (text labels, zones, etc.)
 */

import { DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import { theme } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import { NodeResizer, useViewport } from 'reactflow';
import type { BoardObject } from '@agor/core/types';
import { DeleteZoneModal } from './DeleteZoneModal';
import { ZoneConfigModal } from './ZoneConfigModal';

/**
 * Get color palette from Ant Design preset colors
 * Uses the -6 variants (primary saturation) from the color scale
 */
const getColorPalette = (token: ReturnType<typeof theme.useToken>['token']) => [
  token.colorBorder, // gray (neutral default)
  token.red6 || token.red, // red-6
  token.orange6 || token.orange, // orange-6
  token.green6 || token.green, // green-6
  token.blue6 || token.blue, // blue-6
  token.purple6 || token.purple, // purple-6
  token.magenta6 || token.magenta, // magenta-6
];

/**
 * ZoneNode - Resizable rectangle for organizing sessions visually
 */
interface ZoneNodeData {
  objectId: string;
  label: string;
  width: number;
  height: number;
  color?: string;
  status?: string;
  x: number;
  y: number;
  trigger?: BoardObject extends { type: 'zone'; trigger?: infer T } ? T : never;
  sessionCount?: number;
  onUpdate?: (objectId: string, objectData: BoardObject) => void;
  onDelete?: (objectId: string, deleteAssociatedSessions: boolean) => void;
}

const ZoneNodeComponent = ({ data, selected }: { data: ZoneNodeData; selected?: boolean }) => {
  const { token } = theme.useToken();
  const { zoom } = useViewport();
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [label, setLabel] = useState(data.label);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const colors = getColorPalette(token);

  // Inverse scale to keep toolbar at constant size regardless of zoom
  const scale = 1 / zoom;

  // Sync label state when data.label changes (from WebSocket or modal updates)
  useEffect(() => {
    setLabel(data.label);
  }, [data.label]);

  // Sync toolbar visibility with selected state
  useEffect(() => {
    if (selected) {
      setToolbarVisible(true);
    } else {
      // Delay hiding to prevent flicker during re-renders
      const timer = setTimeout(() => setToolbarVisible(false), 100);
      return () => clearTimeout(timer);
    }
  }, [selected]);

  // Auto-focus input when entering edit mode
  useEffect(() => {
    if (isEditingLabel && labelInputRef.current) {
      labelInputRef.current.focus();
      labelInputRef.current.select();
    }
  }, [isEditingLabel]);

  // Helper to create full object data with current values
  const createObjectData = (
    overrides: Partial<{
      width: number;
      height: number;
      label: string;
      color?: string;
      status?: string;
      trigger?: BoardObject extends { type: 'zone'; trigger?: infer T } ? T : never;
    }>
  ): BoardObject => ({
    type: 'zone',
    x: data.x,
    y: data.y,
    width: data.width,
    height: data.height,
    label: data.label,
    color: data.color,
    status: data.status,
    trigger: data.trigger,
    ...overrides,
  });

  const handleSaveLabel = () => {
    setIsEditingLabel(false);
    if (label !== data.label && data.onUpdate) {
      data.onUpdate(data.objectId, createObjectData({ label }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveLabel();
    } else if (e.key === 'Escape') {
      setLabel(data.label); // Reset to original
      setIsEditingLabel(false);
    }
  };

  const handleColorChange = (color: string) => {
    if (data.onUpdate) {
      data.onUpdate(data.objectId, createObjectData({ color }));
    }
  };

  const borderColor = data.color || token.colorBorder;
  const backgroundColor = data.color ? `${data.color}20` : `${token.colorBgContainer}40`; // 40 = 25% opacity in hex

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={200}
        handleStyle={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: borderColor,
        }}
        lineStyle={{
          borderColor: borderColor,
        }}
      />
      <div
        style={{
          width: '100%',
          height: '100%',
          border: `2px solid ${borderColor}`,
          borderRadius: token.borderRadiusLG,
          background: backgroundColor,
          padding: token.padding,
          display: 'flex',
          flexDirection: 'column',
          pointerEvents: 'none', // Let sessions behind zone be clickable
          zIndex: -1, // Zones always behind sessions
          backdropFilter: 'blur(4px)',
          position: 'relative',
        }}
      >
        {/* Toolbar - ALWAYS rendered, visibility controlled by CSS only */}
        <div
          className="nodrag nopan"
          onPointerDown={e => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerUp={e => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
          }}
          style={{
            position: 'absolute',
            top: '-44px',
            left: '50%',
            transform: `translateX(-50%) scale(${scale})`,
            transformOrigin: 'center bottom',
            display: 'flex',
            gap: '8px',
            padding: '6px',
            background: token.colorBgElevated,
            border: `1px solid ${token.colorBorder}`,
            borderRadius: token.borderRadius,
            boxShadow: token.boxShadowSecondary,
            zIndex: 1000,
            userSelect: 'none',
            // CSS-only visibility control (no DOM changes)
            opacity: toolbarVisible ? 1 : 0,
            pointerEvents: toolbarVisible ? 'auto' : 'none',
            transition: 'opacity 0.15s ease',
          }}
        >
          {colors.map(color => (
            <button
              key={color}
              type="button"
              onPointerDown={e => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onPointerUp={e => {
                e.preventDefault();
                e.stopPropagation();
                handleColorChange(color);
              }}
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
              }}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '3px',
                backgroundColor: color,
                border:
                  data.color === color
                    ? `2px solid ${token.colorPrimary}`
                    : `1px solid ${token.colorBorder}`,
                userSelect: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
              title={`Change color to ${color}`}
            />
          ))}
          <div
            style={{
              width: '1px',
              height: '20px',
              backgroundColor: token.colorBorder,
              margin: '0 2px',
            }}
          />
          <button
            type="button"
            onPointerDown={e => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerUp={e => {
              e.preventDefault();
              e.stopPropagation();
              setConfigModalOpen(true);
            }}
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
            }}
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '3px',
              backgroundColor: token.colorBgContainer,
              border: `1px solid ${token.colorBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              userSelect: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
            title="Configure zone"
          >
            <SettingOutlined style={{ fontSize: '12px', color: token.colorText }} />
          </button>
          <button
            type="button"
            onPointerDown={e => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerUp={e => {
              e.preventDefault();
              e.stopPropagation();
              setDeleteModalOpen(true);
            }}
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = token.colorError;
              e.currentTarget.style.borderColor = token.colorError;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = token.colorTextSecondary;
              e.currentTarget.style.borderColor = token.colorBorder;
            }}
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '3px',
              backgroundColor: token.colorBgContainer,
              border: `1px solid ${token.colorBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              userSelect: 'none',
              cursor: 'pointer',
              padding: 0,
              color: token.colorTextSecondary,
            }}
            title="Delete zone"
          >
            <DeleteOutlined style={{ fontSize: '12px' }} />
          </button>
        </div>
        <div
          style={{
            pointerEvents: 'auto',
          }}
          onDoubleClick={() => setIsEditingLabel(true)}
        >
          {isEditingLabel ? (
            <input
              ref={labelInputRef}
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              onBlur={handleSaveLabel}
              onKeyDown={handleKeyDown}
              className="nodrag" // Prevent node drag when typing
              style={{
                margin: 0,
                fontSize: '24px',
                fontWeight: 600,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: borderColor,
                padding: 0,
                width: '100%',
              }}
            />
          ) : (
            <h3
              style={{
                margin: 0,
                fontSize: '24px',
                fontWeight: 600,
                color: borderColor,
              }}
            >
              {label}
            </h3>
          )}
        </div>
        {data.status && (
          <div
            style={{
              marginTop: '8px',
              fontSize: '12px',
              fontWeight: 500,
              color: borderColor,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {data.status}
          </div>
        )}
      </div>
      <ZoneConfigModal
        open={configModalOpen}
        onCancel={() => setConfigModalOpen(false)}
        zoneName={data.label}
        objectId={data.objectId}
        onUpdate={data.onUpdate || (() => {})}
        zoneData={createObjectData({})}
      />
      <DeleteZoneModal
        open={deleteModalOpen}
        onCancel={() => setDeleteModalOpen(false)}
        onConfirm={deleteAssociatedSessions => {
          setDeleteModalOpen(false);
          if (data.onDelete) {
            data.onDelete(data.objectId, deleteAssociatedSessions);
          }
        }}
        zoneName={data.label}
        sessionCount={data.sessionCount || 0}
      />
    </>
  );
};

// Memoize to prevent unnecessary re-renders
export const ZoneNode = React.memo(ZoneNodeComponent);
