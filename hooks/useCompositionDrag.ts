import React, { useCallback, useRef, useState } from 'react';
import type { PixelData, ProcessingSettings } from '../types';
import { TVC_MODES } from '../services/constants';

interface Params {
  sourceImage: HTMLImageElement | null;
  pixelData: PixelData | null;
  settings: ProcessingSettings;
  handleSettingChange: (s: Partial<ProcessingSettings>) => void;
}

// Mouse/touch/wheel interaction on the result preview: in TVC modes dragging
// pans and zooms the composition (settings.positionX/Y, zoom); in Original
// mode it pans and zooms only the on-screen view (viewTransform).
export const useCompositionDrag = ({ sourceImage, pixelData, settings, handleSettingChange }: Params) => {
  // Dragging state for Composition (TVC mode)
  const [isDragging, setIsDragging] = useState(false);
  const resultContainerRef = useRef<HTMLDivElement | null>(null);

  const preventDefaultWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
  }, []);

  const resultContainerCallbackRef = useCallback((node: HTMLDivElement | null) => {
    if (resultContainerRef.current) {
      resultContainerRef.current.removeEventListener('wheel', preventDefaultWheel);
    }
    if (node) {
      node.addEventListener('wheel', preventDefaultWheel, { passive: false });
    }
    resultContainerRef.current = node;
  }, [preventDefaultWheel]);
  const dragRef = useRef<{
      startX: number;
      startY: number;
      initialPosX: number;
      initialPosY: number;
      hasMoved: boolean;
      // For View panning in Original Mode
      initialViewX: number;
      initialViewY: number;
      // Pinch to zoom
      initialPinchDistance: number | null;
      initialZoom: number;
      initialViewScale: number;
  }>({ 
      startX: 0, 
      startY: 0, 
      initialPosX: 50, 
      initialPosY: 50, 
      hasMoved: false, 
      initialViewX: 0, 
      initialViewY: 0,
      initialPinchDistance: null,
      initialZoom: 1.0,
      initialViewScale: 1.0
  });

  // View state for Original Mode (Pan & Zoom)
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, scale: 1 });


  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (!sourceImage || !pixelData) return;
    
    const isTouch = 'touches' in e;
    const touches = isTouch ? (e as React.TouchEvent).touches : null;
    
    const clientX = touches ? touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = touches ? touches[0].clientY : (e as React.MouseEvent).clientY;

    setIsDragging(true);
    
    let initialPinchDistance = null;
    if (touches && touches.length >= 2) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
    }

    dragRef.current = {
        startX: clientX,
        startY: clientY,
        initialPosX: settings.positionX,
        initialPosY: settings.positionY,
        hasMoved: false,
        initialViewX: viewTransform.x,
        initialViewY: viewTransform.y,
        initialPinchDistance,
        initialZoom: settings.zoom,
        initialViewScale: viewTransform.scale
    };
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !sourceImage || !resultContainerRef.current || !pixelData) return;
    
    const isTouch = 'touches' in e;
    const touches = isTouch ? (e as React.TouchEvent).touches : null;

    if (isTouch) {
      // Prevent default scrolling behavior on touch devices while interacting with the preview
      if (e.cancelable) e.preventDefault();
    }

    // Handle Pinch to Zoom
    if (touches && touches.length >= 2 && dragRef.current.initialPinchDistance !== null) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);
      const pinchScale = currentDistance / dragRef.current.initialPinchDistance;

      if (settings.resolutionMode === 'original') {
        const newScale = Math.max(0.1, Math.min(10.0, dragRef.current.initialViewScale * pinchScale));
        setViewTransform(prev => ({ ...prev, scale: newScale }));
      } else if (settings.fitMode !== 'stretch') {
        let newZoom = dragRef.current.initialZoom * pinchScale;
        newZoom = Math.max(0.1, Math.min(10.0, newZoom));
        handleSettingChange({ zoom: parseFloat(newZoom.toFixed(2)) });
      }
      return;
    }
    
    const clientX = touches ? touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = touches ? touches[0].clientY : (e as React.MouseEvent).clientY;
    
    const deltaXScreen = clientX - dragRef.current.startX;
    const deltaYScreen = clientY - dragRef.current.startY;
    
    if (Math.abs(deltaXScreen) > 3 || Math.abs(deltaYScreen) > 3) {
         dragRef.current.hasMoved = true;
    }

    if (settings.resolutionMode === 'original') {
        // --- VIEW PANNING (Original Mode) ---
        // Just move the view, do not change settings
        const newX = dragRef.current.initialViewX + deltaXScreen;
        const newY = dragRef.current.initialViewY + deltaYScreen;
        setViewTransform(prev => ({ ...prev, x: newX, y: newY }));
        return;
    }

    // --- COMPOSITION DRAGGING (TVC Mode) ---
    const rect = resultContainerRef.current.getBoundingClientRect();
    const displayedWidth = rect.width;
    const displayedHeight = rect.height;
    
    const scaleX = pixelData.width / displayedWidth;
    const scaleY = pixelData.height / displayedHeight;
    
    const deltaXInternal = deltaXScreen * scaleX;
    const deltaYInternal = deltaYScreen * scaleY;

    // Calculate Geometry logic
    const isTVC16 = settings.outputMode === TVC_MODES.MODE_16;
    const isTVC4 = settings.outputMode === TVC_MODES.MODE_4;
    const isTVC2 = settings.outputMode === TVC_MODES.MODE_2;
    
    // Logic widths are Visual widths
    let logicalWidth = Math.ceil(sourceImage.width/2) * 2;
    let logicalHeight = sourceImage.height;
    if (isTVC16) {
      logicalWidth = 256;
      logicalHeight = 240;
    } else if (isTVC4) {
      logicalWidth = 256;
      logicalHeight = 240;
    } else if (isTVC2) {
      logicalWidth = 512;
      logicalHeight = 240;
    }
    
    let drawWidth = logicalWidth;
    let drawHeight = logicalHeight;

    if (settings.fitMode === 'stretch') {
         drawWidth = logicalWidth;
         drawHeight = logicalHeight;
    } else {
        const imageAspect = sourceImage.width / sourceImage.height;
        const targetAspect = logicalWidth / logicalHeight;

        if (settings.fitMode === 'cover') {
          if (imageAspect > targetAspect) {
            drawHeight = logicalHeight;
            drawWidth = logicalHeight * imageAspect;
          } else {
            drawWidth = logicalWidth;
            drawHeight = logicalWidth / imageAspect;
          }
        } else if (settings.fitMode === 'contain') {
          if (imageAspect > targetAspect) {
            drawWidth = logicalWidth;
            drawHeight = logicalWidth / imageAspect;
          } else {
            drawHeight = logicalHeight;
            drawWidth = logicalHeight * imageAspect;
          }
        }
        
        drawWidth *= settings.zoom;
        drawHeight *= settings.zoom;
    }
    
    // We multiply deltaX by 2 because pixelData.width is "raw" (compressed) width,
    // but drag operations happen in "visual" (stretched) space.
    const effectiveDeltaX = deltaXInternal * 2;
    const effectiveDeltaY = deltaYInternal;

    const rangeX = logicalWidth - drawWidth;
    const rangeY = logicalHeight - drawHeight;

    let newX = dragRef.current.initialPosX;
    let newY = dragRef.current.initialPosY;

    if (Math.abs(rangeX) > 0.1) {
         newX = dragRef.current.initialPosX + (effectiveDeltaX / rangeX) * 100;
    }
    
    if (Math.abs(rangeY) > 0.1) {
         newY = dragRef.current.initialPosY + (effectiveDeltaY / rangeY) * 100;
    }

    newX = Math.max(0, Math.min(100, newX));
    newY = Math.max(0, Math.min(100, newY));

    handleSettingChange({ positionX: newX, positionY: newY });
  };

  const handleDragEnd = (e?: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging) return;
    
    if (e && 'touches' in e && e.touches.length > 0) {
      // Still have fingers on screen, "restart" drag with the first one to avoid jumps
      handleDragStart(e);
      return;
    }
    
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (settings.resolutionMode === 'original') {
        // --- VIEW ZOOMING (Original Mode) ---
        // Zoom the preview ONLY
        const step = 0.05;
        const direction = e.deltaY < 0 ? 1 : -1;
        let newScale = viewTransform.scale * (1 + direction * step);
        newScale = Math.max(0.1, Math.min(10.0, newScale));
        setViewTransform(prev => ({ ...prev, scale: newScale }));
        handleSettingChange({ zoom: newScale });
        return;
    }

    // --- COMPOSITION ZOOMING (TVC Mode) ---
    if (settings.fitMode === 'stretch') return;
    
    const step = 0.1;
    const direction = e.deltaY < 0 ? 1 : -1; // Up = Zoom In, Down = Zoom Out
    
    let newZoom = settings.zoom + (direction * step);
    newZoom = Math.max(0.1, Math.min(10.0, newZoom));
    newZoom = parseFloat(newZoom.toFixed(1));

    if (newZoom !== settings.zoom) {
      handleSettingChange({ zoom: newZoom });
    }
  };

  return {
    isDragging, resultContainerRef, resultContainerCallbackRef, viewTransform, setViewTransform,
    handleDragStart, handleDragMove, handleDragEnd, handleWheel,
  };
};
