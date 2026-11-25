import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, Layers, Image as ImageIcon, Monitor, Sun, Contrast, Zap, Palette as PaletteIcon, Move, RotateCcw, ArrowLeftRight, Maximize, X, Eye, EyeOff, Wand2, Expand, Info, Sparkles, Filter, Copy, Crop, Pencil, Columns2, Rainbow, Thermometer, Undo2, Redo2, LayoutGrid } from 'lucide-react';
import Button from './components/Button';
import ControlGroup from './components/ControlGroup';
import Slider from './components/Slider';
import ExportButtons from './components/ExportButtons';
import ManualModal from './components/ManualModal';
import AppFooter from './components/AppFooter';
import AppHeader from './components/AppHeader';
import AutoTuneModal from './components/AutoTuneModal';
import CompareOverlay from './components/CompareOverlay';
import TemperatureFilter from './components/TemperatureFilter';
import DitherGrid from './components/DitherGrid';
import { ProcessingState, ProcessingSettings, PixelData, DitherMethod, ImageAdjustments } from './types';
import { processImage, trimSolidBorder, generateTransparencyMask, createMaskedPreviewUrl, pairKey } from './services/imageProcessor';
import { encodeBMP, encodeBMP4bpp, encodeEditorBin, TVCEditorMode, DEFAULT_ACTIVE_COLORS } from './services/bmpEncoder';
import PixelEditor from './PixelEditor';
import { compressZX7 } from './services/zx7';
import { findBestColors } from './services/autoTuner';
import { runAutoTune, AUTO_TUNE_ABORTED } from './services/autoTuneClient';
import { FIXED_PALETTE } from './services/palette';
import { downloadBlob } from './utils/download';
import { TVC_MODES, ERROR_DIFFUSION_METHODS, DEFAULT_ADJUSTMENTS } from './services/constants';
import { useCompositionDrag } from './hooks/useCompositionDrag';
import { renderCompositionPreview } from './services/composition';
import { convertImage } from './services/convert';
import { ditherOptionGroups } from './services/ditherOptions';
import { useClipboardImagePaste } from './hooks/useClipboardImagePaste';
import { useUndoHistory } from './hooks/useUndoHistory';
import { useUndoRedoKeys } from './hooks/useUndoRedoKeys';
import { translations, Language } from './i18n';


const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('hu');
  const t = translations[lang];
  
  const sliderTitles = {
    increase: t.increase,
    decrease: t.decrease
  };

  const [state, setState] = useState<ProcessingState>(ProcessingState.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [pixelData, setPixelData] = useState<PixelData | null>(null);
  interface EditorConfig {
    width: number;
    height: number;
    pixelAspectX: number;
    mode: TVCEditorMode;
    indices: Uint8Array;
    activeColors?: number[];
    filenameBase: string;
  }
  const [editorConfig, setEditorConfig] = useState<EditorConfig | null>(null);
  const [showFullRes, setShowFullRes] = useState(false);
  const [showTheaterMode, setShowTheaterMode] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [inputFilename, setInputFilename] = useState<string | null>(null);
  const [isAutoTuning, setIsAutoTuning] = useState(false);
  const [autoTuneProgress, setAutoTuneProgress] = useState(0);
  const autoTuneAbortController = useRef<AbortController | null>(null);
  const colorPickerRef = useRef<HTMLDivElement | null>(null);
  const processingDebounceRef = useRef<any>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowFullRes(false);
        setShowManual(false);
        setShowTheaterMode(false);
        setActiveColorPicker(null);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setActiveColorPicker(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Cleanup object URL to prevent memory leaks
  useEffect(() => {
    let lastUrl = pixelData?.processedUrl;
    return () => {
      if (lastUrl && lastUrl.startsWith('blob:')) {
        URL.revokeObjectURL(lastUrl);
      }
    };
  }, [pixelData?.processedUrl]);
  
  const DEFAULT_SETTINGS: ProcessingSettings = {
    ditherMethod: 'pattern-tvc',
    fitMode: 'cover',
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    positionX: 50,
    positionY: 50,
    zoom: 1.0,
    backgroundColor: '#000000',
    outputMode: 'tvc-16',
    resolutionMode: 'tvc',
    saveOriginalSize: true,
    serpentine: true,
    perceptualWeighting: true,
    pixelArtCleaning: false,
    autoColorSelection: false,
    disabledPatternPairs: [],
    resizeQuality: 'sharp',
    preciseAutoColor: false,
    patternMixMode: 'checker'
  };

  const [currentMode, setCurrentMode] = useState<'tvc-16' | 'tvc-4' | 'tvc-2'>('tvc-16');
  const [settingsMap, setSettingsMap] = useState<Record<string, ProcessingSettings>>({
    'tvc-16': { ...DEFAULT_SETTINGS, outputMode: 'tvc-16' },
    'tvc-4': { ...DEFAULT_SETTINGS, outputMode: 'tvc-4', selectedColors: [0, 1, 2, 3] },
    'tvc-2': { ...DEFAULT_SETTINGS, outputMode: 'tvc-2', selectedColors: [0, 14] }
  });

  const settings = settingsMap[currentMode];

  const setSettings = (newSettings: ProcessingSettings | ((prev: ProcessingSettings) => ProcessingSettings)) => {
    setSettingsMap(prev => {
      const updated = typeof newSettings === 'function' ? newSettings(prev[currentMode]) : newSettings;
      return { ...prev, [currentMode]: updated };
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [originalBase64, setOriginalBase64] = useState<string | null>(null);
  const [activeColorPicker, setActiveColorPicker] = useState<number | null>(null);
  const [savedSlots, setSavedSlots] = useState<Record<number, boolean>>({ 1: false, 2: false, 3: false });
  const [transparencyMask, setTransparencyMask] = useState<Uint8Array | null>(null);
  const [maskVisible, setMaskVisible] = useState<boolean>(true);
  const [maskedPreviewUrl, setMaskedPreviewUrl] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [showDitherGrid, setShowDitherGrid] = useState(false);
  const [comparePosition, setComparePosition] = useState(50);
  const [compareBeforeUrl, setCompareBeforeUrl] = useState<string | null>(null);

  const handleGenerateMask = () => {
    if (!pixelData) return;
    const mask = generateTransparencyMask(pixelData.width, pixelData.height, pixelData.indices);
    const url = createMaskedPreviewUrl(pixelData.width, pixelData.height, pixelData.rgba, mask);
    setTransparencyMask(mask);
    setMaskedPreviewUrl(url);
    setMaskVisible(true);
  };

  const handleClearMask = () => {
    setTransparencyMask(null);
    setMaskedPreviewUrl(null);
  };

  const handleToggleMaskVisibility = () => {
    setMaskVisible(prev => !prev);
  };

  React.useEffect(() => {
    const slots = { 1: false, 2: false, 3: false };
    for (let i = 1; i <= 3; i++) {
      if (localStorage.getItem(`tvc-settings-slot-${i}`)) {
        slots[i as keyof typeof slots] = true;
      }
    }
    setSavedSlots(slots);
  }, []);

  const startProcessing = async (img: HTMLImageElement, currentSettings: ProcessingSettings) => {
    setState(ProcessingState.PROCESSING);
    setError(null);

    try {
      const conv = await convertImage(img, currentSettings);

      setTransparencyMask(null);
      setMaskedPreviewUrl(null);
      setPixelData({
        originalUrl: img.src,
        processedUrl: conv.url,
        indices: conv.indices,
        rgba: conv.rgba,
        palette: FIXED_PALETTE,
        width: conv.rawWidth,
        height: conv.rawHeight
      });
      setState(ProcessingState.COMPLETED);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during processing.");
      setState(ProcessingState.ERROR);
    }
  };

  const [autoCropBorder, setAutoCropBorder] = useState<boolean>(true);

  const handleTrimBorder = async () => {
    if (!sourceImage) return;
    const trimmed = await trimSolidBorder(sourceImage);
    setSourceImage(trimmed);
    setOriginalBase64(trimmed.src);
    startProcessing(trimmed, settings);
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    
    // Extract filename logic
    const lastDotIndex = file.name.lastIndexOf('.');
    const nameWithoutExt = lastDotIndex !== -1 ? file.name.substring(0, lastDotIndex) : file.name;
    setInputFilename(nameWithoutExt);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        let finalImg = img;
        if (autoCropBorder) {
          finalImg = await trimSolidBorder(img);
        }
        setSourceImage(finalImg);
        setOriginalBase64(finalImg.src);

        // Reset all settings to defaults
        const defaultSettings: ProcessingSettings = {
          ditherMethod: 'pattern-tvc',
          fitMode: 'cover',
          adjustments: { ...DEFAULT_ADJUSTMENTS },
          positionX: 50,
          positionY: 50,
          zoom: 1.0,
          backgroundColor: '#000000',
          outputMode: 'tvc-16',
          resolutionMode: 'tvc',
          saveOriginalSize: true,
          serpentine: true,
          perceptualWeighting: true,
          pixelArtCleaning: false,
          autoColorSelection: false,
          disabledPatternPairs: [],
          resizeQuality: 'sharp',
          preciseAutoColor: false,
          patternMixMode: 'checker'
        };
        
        const best4 = findBestColors(finalImg, 4);
        const best2 = findBestColors(finalImg, 2);

        const newSettingsMap = {
          'tvc-16': { ...defaultSettings, outputMode: 'tvc-16' as const },
          'tvc-4': { ...defaultSettings, outputMode: 'tvc-4' as const, selectedColors: best4 },
          'tvc-2': { ...defaultSettings, outputMode: 'tvc-2' as const, selectedColors: best2 }
        };

        setSettingsMap(newSettingsMap);
        setCurrentMode('tvc-16');
        setViewTransform({ x: 0, y: 0, scale: 1 }); // Reset view
        startProcessing(finalImg, newSettingsMap['tvc-16']);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Ctrl+V: load an image from the clipboard (not while the Pixel Editor is open).
  useClipboardImagePaste(processFile, !editorConfig);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleModeChange = (mode: 'tvc-16' | 'tvc-4' | 'tvc-2') => {
    setCurrentMode(mode);
    const newSettings = settingsMap[mode];
    if (sourceImage) {
      startProcessing(sourceImage, newSettings);
    }
  };

  const handleColorChange = (index: number, newColorIdx: number) => {
    if (!settings.selectedColors) return;
    const newColors = [...settings.selectedColors];
    newColors[index] = newColorIdx;
    handleSettingChange({ selectedColors: newColors });
    setActiveColorPicker(null);
  };

  const [pairPanelCollapsed, setPairPanelCollapsed] = useState(true);

  const handleTogglePatternPair = (hexA: string, hexB: string) => {
    const key = pairKey(hexA, hexB);
    const current = settings.disabledPatternPairs ?? [];
    const updated = current.includes(key)
      ? current.filter(k => k !== key)
      : [...current, key];
    handleSettingChange({ disabledPatternPairs: updated });
  };

  // Excludes (or restores) a color entirely from pattern-tvc: every pair
  // involving it, including its own solid fill - not just one mixed pair.
  // Excluding a whole color is recorded ONLY as its self pair. Previously
  // this wrote all 15 pairs for the color, which meant toggling one color
  // (or a single mixed cell) silently mutated pairs that another color's
  // "is it excluded?" check depended on - so x marks would disappear from
  // colors the user hadn't touched, while the exclusion still applied.
  const handleToggleColorPattern = (hex: string) => {
    const selfKey = pairKey(hex, hex);
    const allKeysForColor = FIXED_PALETTE.map(otherHex => pairKey(hex, otherHex));
    const current = settings.disabledPatternPairs ?? [];
    // Whether the color counts as excluded is decided by its SELF pair only.
    // Deriving it from "are all 15 pairs disabled?" was the old bug: toggling
    // one color (or a single mixed cell) mutated pairs another color's check
    // depended on, so x marks vanished from colors the user never touched.
    const isExcluded = current.includes(selfKey);
    const updated = isExcluded
      ? current.filter(k => !allKeysForColor.includes(k))
      : [...current, ...allKeysForColor.filter(k => !current.includes(k))];
    handleSettingChange({ disabledPatternPairs: updated });
  };

  const renderColorSelectors = () => {
    if (!isTVC4 && !isTVC2) return null;
    if (!settings.selectedColors) return null;
    
    return (
      <ControlGroup title={t.selectedColors || "Selected Colors"} icon={<PaletteIcon size={14} className="text-pink-400" />} className="space-y-3" contentClassName="space-y-2">
        <div className="grid grid-cols-4 gap-2">
          {settings.selectedColors.map((colorIdx, i) => (
            <div key={i} className="relative flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 uppercase text-center">Color {i+1}</span>
              <button
                onClick={() => setActiveColorPicker(activeColorPicker === i ? null : i)}
                className="w-full h-8 rounded border border-slate-700 hover:border-blue-500 transition-colors"
                style={{ backgroundColor: FIXED_PALETTE[colorIdx] }}
                title={t.ttSelectColor}
              />
              {activeColorPicker === i && (
                <div ref={colorPickerRef} className={`absolute top-full mt-2 p-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 w-[140px] ${i >= 2 ? 'right-0' : 'left-0'}`}>
                  <div className="grid grid-cols-5 gap-1">
                    {FIXED_PALETTE.map((color, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleColorChange(i, idx)}
                        className={`w-5 h-5 rounded-sm border ${colorIdx === idx ? 'border-white' : 'border-transparent hover:border-slate-400'}`}
                        style={{ backgroundColor: color }}
                        title={t.colorNames ? t.colorNames[idx] : `TVC ${idx}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          {isTVC2 && (
            <>
              <div /> {/* Empty space to leave a "color unit" gap */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-500 uppercase text-center invisible">Inv</span>
                <button 
                  onClick={() => handleSettingChange({ invertColors: !settings.invertColors })}
                  className={`w-full h-8 flex items-center justify-center rounded border transition-all duration-200 ${
                    settings.invertColors 
                      ? "bg-blue-600 border-blue-400 text-white shadow-[0_0_10px_rgba(37,99,235,0.5)] ring-1 ring-blue-400" 
                      : "bg-slate-700 border-slate-600 text-slate-400 hover:text-white hover:bg-slate-600"
                  }`}
                  title={t.ttInvertColors}
                >
                  <ArrowLeftRight size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      </ControlGroup>
    );
  };
  const saveSettingsToSlot = (slot: number) => {
    try {
      localStorage.setItem(`tvc-settings-slot-${slot}`, JSON.stringify(settings));
      setSavedSlots(prev => ({ ...prev, [slot]: true }));
    } catch (e) {
      console.error("Failed to save settings", e);
    }
  };

  const loadSettingsFromSlot = (slot: number) => {
    try {
      const saved = localStorage.getItem(`tvc-settings-slot-${slot}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Fix: Update currentMode if outputMode is different
        if (parsed.outputMode && parsed.outputMode !== currentMode) {
          setCurrentMode(parsed.outputMode);
        }
        setSettingsMap(prev => ({ ...prev, [parsed.outputMode || currentMode]: parsed }));
        if (sourceImage) {
          startProcessing(sourceImage, parsed);
        }
      }
    } catch (e) {
      console.error("Failed to load settings", e);
    }
  };

  const deleteSettingsFromSlot = (slot: number) => {
    localStorage.removeItem(`tvc-settings-slot-${slot}`);
    setSavedSlots(prev => ({ ...prev, [slot]: false }));
  };

  const SETTINGS_FILE_EXTENSION = '.tvcset';

  const exportSettingsToFile = () => {
    const defaultName = `${inputFilename || 'tvc-settings'}${SETTINGS_FILE_EXTENSION}`;
    const filename = window.prompt(t.exportSettingsFilenamePrompt || 'File name:', defaultName);
    if (!filename) return;
    const finalName = filename.toLowerCase().endsWith(SETTINGS_FILE_EXTENSION) ? filename : `${filename}${SETTINGS_FILE_EXTENSION}`;
    try {
      // Pretty-printed JSON - a plain text file, editable in any text editor,
      // just with a distinct extension so it's recognizable as a TVC preset.
      const json = JSON.stringify(settings, null, 2);
      const blob = new Blob([json], { type: 'text/plain' });
      downloadBlob(blob, finalName);
    } catch (e) {
      console.error('Failed to export settings', e);
    }
  };

  const settingsFileInputRef = useRef<HTMLInputElement>(null);
  const handleImportSettingsClick = () => settingsFileInputRef.current?.click();

  const importSettingsFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (settingsFileInputRef.current) settingsFileInputRef.current.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (parsed.outputMode && parsed.outputMode !== currentMode) {
          setCurrentMode(parsed.outputMode);
        }
        setSettingsMap(prev => ({ ...prev, [parsed.outputMode || currentMode]: parsed }));
        if (sourceImage) {
          startProcessing(sourceImage, parsed);
        }
      } catch (err) {
        console.error('Failed to parse settings file', err);
        alert(t.importSettingsError || 'Could not read this settings file - it may be corrupted or not a valid settings export.');
      }
    };
    reader.onerror = () => alert(t.importSettingsError || 'Could not read this settings file.');
    reader.readAsText(file);
  };

  const handleSettingChange = (newSettings: Partial<ProcessingSettings>) => {
    setSettings(prev => {
      let updated = { ...prev, ...newSettings };

      if (newSettings.fitMode === 'cover' || newSettings.fitMode === 'contain' || newSettings.fitMode === 'stretch') {
        if (updated.zoom !== 1.0 && !newSettings.zoom) updated.zoom = 1.0;
      }

      if (sourceImage) {
        if (processingDebounceRef.current) {
          clearTimeout(processingDebounceRef.current);
        }
        processingDebounceRef.current = setTimeout(() => {
          startProcessing(sourceImage, updated);
        }, 150);
      }
      return updated;
    });
  };

  const handleAdjustmentChange = (newAdj: Partial<ImageAdjustments>) => {
    setSettings(prev => {
      const updated = { 
        ...prev, 
        adjustments: { ...prev.adjustments, ...newAdj } 
      };
      if (sourceImage) {
        if (processingDebounceRef.current) {
          clearTimeout(processingDebounceRef.current);
        }
        processingDebounceRef.current = setTimeout(() => {
          startProcessing(sourceImage, updated);
        }, 150);
      }
      return updated;
    });
  };

  // Undo/redo of converter settings (all modes + which mode is active).
  // Starts over for each new image.
  const settingsSnapshot = React.useMemo(() => ({ map: settingsMap, mode: currentMode }), [settingsMap, currentMode]);
  const settingsHistory = useUndoHistory(settingsSnapshot, sourceImage, (a, b) => a.map === b.map && a.mode === b.mode);
  const applySettingsSnapshot = (snap: typeof settingsSnapshot | null) => {
    if (!snap) return;
    setSettingsMap(snap.map);
    setCurrentMode(snap.mode);
    if (sourceImage) {
      if (processingDebounceRef.current) clearTimeout(processingDebounceRef.current);
      startProcessing(sourceImage, snap.map[snap.mode]);
    }
  };
  const undoSettings = () => applySettingsSnapshot(settingsHistory.undo());
  const redoSettings = () => applySettingsSnapshot(settingsHistory.redo());
  useUndoRedoKeys(undoSettings, redoSettings, !editorConfig && !!sourceImage);

  const handleAutoTune = async (tuningStrategy: 'artistic' | 'fidelity' | 'flat' | 'precision' = 'artistic') => {
    if (!sourceImage) return;
    
    if (autoTuneAbortController.current) {
      autoTuneAbortController.current.abort();
    }
    autoTuneAbortController.current = new AbortController();
    
    setIsAutoTuning(true);
    setAutoTuneProgress(0);
    
    try {
      // Auto-detect optimal settings for cropped composition area
      const compositionSettings = {
        zoom: settings.zoom,
        positionX: settings.positionX,
        positionY: settings.positionY,
        fitMode: settings.fitMode,
        backgroundColor: settings.backgroundColor
      };

      const { adjustments, ditherMethod, selectedColors } = await runAutoTune(
        sourceImage,
        settings.outputMode,
        settings.selectedColors ?? [],
        (progress) => setAutoTuneProgress(progress),
        autoTuneAbortController.current.signal,
        tuningStrategy,
        compositionSettings,
        settings.disabledPatternPairs ?? []
      );
      
      handleSettingChange({
        adjustments: adjustments,
        ditherMethod: ditherMethod,
        ...(selectedColors ? { selectedColors } : {})
      });
    } catch (error) {
      if (error instanceof Error && error.message === AUTO_TUNE_ABORTED) {
        console.log('Auto-tuning cancelled by user');
      } else {
        console.error('Auto-tuning failed:', error);
      }
    } finally {
      setIsAutoTuning(false);
      setAutoTuneProgress(0);
      autoTuneAbortController.current = null;
    }
  };

  const cancelAutoTune = () => {
    if (autoTuneAbortController.current) {
      autoTuneAbortController.current.abort();
    }
  };

  // Drag Handlers
  const {
    isDragging, resultContainerRef, resultContainerCallbackRef, viewTransform, setViewTransform,
    handleDragStart, handleDragMove, handleDragEnd, handleWheel,
  } = useCompositionDrag({ sourceImage, pixelData, settings, handleSettingChange });

  const resetAdjustments = () => {
    handleAdjustmentChange(DEFAULT_ADJUSTMENTS);
  };

  const generateFilename = (ext: string, ratio?: number) => {
    let suffix = '';
    if (settings.resolutionMode === 'tvc256k') {
      suffix = '_256k';
    } else if (settings.outputMode === 'tvc-16') {
      suffix = '_16c';
    } else if (settings.outputMode === 'tvc-4') {
      suffix = '_4c';
    } else if (settings.outputMode === 'tvc-2') {
      suffix = '_2c';
    }

    if (ext === 'bmp' && settings.outputMode === 'tvc-16' && settings.resolutionMode !== 'tvc256k' && ratio !== undefined) {
      suffix += `_${ratio}_1`;
    }

    if (inputFilename) {
      return `${inputFilename}${suffix}.${ext}`;
    }
    const d = new Date();
    const dateStr = d.toISOString().split('T')[0];
    return `tvc-image${suffix}_${dateStr}.${ext}`;
  };

  // --- Pixel Editor integration ---
  const [editorKey, setEditorKey] = useState(0);

  const openEditorFromResult = () => {
    if (!pixelData) return;
    const isTVC256k = settings.resolutionMode === 'tvc256k';
    const isTVC4 = settings.outputMode === 'tvc-4';
    const isTVC2 = settings.outputMode === 'tvc-2';
    const indices = new Uint8Array(pixelData.indices);

    if (!isTVC4 && !isTVC2 && transparencyMask && transparencyMask.length === indices.length) {
      for (let i = 0; i < indices.length; i++) {
        if (transparencyMask[i] === 1) indices[i] = 15; // editor's transparent sentinel
      }
    }

    let mode: TVCEditorMode = 'tvc-16';
    if (isTVC256k) mode = 'tvc256k';
    else if (isTVC4) mode = 'tvc-4';
    else if (isTVC2) mode = 'tvc-2';

    setEditorConfig({
      width: pixelData.width,
      height: pixelData.height,
      pixelAspectX: mode === 'tvc-16' ? 2 : 1,
      mode,
      indices,
      activeColors: (isTVC4 || isTVC2) ? (settings.selectedColors ?? DEFAULT_ACTIVE_COLORS[isTVC4 ? 'tvc-4' : 'tvc-2']) : undefined,
      filenameBase: inputFilename || 'tvc-image'
    });
    setEditorKey(k => k + 1);
  };

  const openBlankEditor = (mode: TVCEditorMode) => {
    const width = mode === 'tvc256k' ? 256 : mode === 'tvc-4' ? 256 : mode === 'tvc-2' ? 512 : 128;
    const height = 240;
    const activeColors = (mode === 'tvc-4' || mode === 'tvc-2') ? DEFAULT_ACTIVE_COLORS[mode] : undefined;
    setEditorConfig({
      width, height,
      pixelAspectX: mode === 'tvc-16' ? 2 : 1,
      mode,
      indices: new Uint8Array(width * height), // all zero -> index 0 (black)
      activeColors,
      filenameBase: 'tvc-image'
    });
    setEditorKey(k => k + 1);
  };

  const closeEditor = () => setEditorConfig(null);

  const generateEditorFilename = (ext: string, cfg: EditorConfig, ratio?: number) => {
    let suffix = cfg.mode === 'tvc256k' ? '_256k' : cfg.mode === 'tvc-4' ? '_4c' : cfg.mode === 'tvc-2' ? '_2c' : '_16c';
    if (ext === 'bmp' && cfg.mode === 'tvc-16' && ratio !== undefined) suffix += `_${ratio}_1`;
    const d = new Date();
    const dateStr = d.toISOString().split('T')[0];
    return `${cfg.filenameBase}_edit${suffix}_${dateStr}.${ext}`;
  };

  const handleEditorSaveBMP = (ratio: number, indices: Uint8Array, mask: Uint8Array) => {
    if (!editorConfig) return;
    let blob: Blob;
    if (editorConfig.mode === 'tvc256k') {
      blob = encodeBMP4bpp(editorConfig.width, editorConfig.height, indices, mask);
    } else {
      const rgba = new Uint8ClampedArray(editorConfig.width * editorConfig.height * 4);
      for (let i = 0; i < indices.length; i++) {
        const hex = FIXED_PALETTE[indices[i]] || '#000000';
        const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255;
      }
      blob = encodeBMP(editorConfig.width, editorConfig.height, rgba, ratio, mask);
    }
    downloadBlob(blob, generateEditorFilename('bmp', editorConfig, ratio));
  };

  const handleEditorSaveBIN = (indices: Uint8Array, mask: Uint8Array, activeColors?: number[]) => {
    if (!editorConfig) return;
    const buffer = encodeEditorBin(editorConfig.width, editorConfig.height, indices, mask, editorConfig.mode, activeColors ?? editorConfig.activeColors);
    const blob = new Blob([buffer as any], { type: 'application/octet-stream' });
    downloadBlob(blob, generateEditorFilename('bin', editorConfig));
  };

  const handleEditorSaveBINZX7 = (indices: Uint8Array, mask: Uint8Array, activeColors?: number[]) => {
    if (!editorConfig) return;
    const buffer = encodeEditorBin(editorConfig.width, editorConfig.height, indices, mask, editorConfig.mode, activeColors ?? editorConfig.activeColors);
    const compressed = compressZX7(buffer);
    const blob = new Blob([compressed as any], { type: 'application/octet-stream' });
    downloadBlob(blob, generateEditorFilename('bin.zx7', editorConfig));
  };

  const handleEditorImageLoaded = (decoded: { width: number; height: number; pixelAspectX: number; mode: TVCEditorMode; indices: Uint8Array; activeColors?: number[] }) => {
    setEditorConfig({
      width: decoded.width,
      height: decoded.height,
      pixelAspectX: decoded.pixelAspectX,
      mode: decoded.mode,
      indices: decoded.indices,
      activeColors: decoded.activeColors,
      filenameBase: editorConfig?.filenameBase || 'tvc-image'
    });
    setEditorKey(k => k + 1);
  };

  const getProcessedDataForSaving = async (): Promise<PixelData | null> => {
    if (!pixelData || !sourceImage) return null;

    // If we are in Original Mode but the user wants to save the composition (TVC resolution)
    if (settings.resolutionMode === 'original' && !settings.saveOriginalSize) {
      const paletteToUse = settings.selectedColors 
        ? settings.selectedColors.map(i => FIXED_PALETTE[i])
        : FIXED_PALETTE;

      // Calculate custom offset to match the preview exactly
      let customOffset = undefined;
      if (resultContainerRef.current && pixelData) {
        const containerWidth = resultContainerRef.current.clientWidth;
        const containerHeight = resultContainerRef.current.clientHeight;
        const scaleFactor = tvcLogicalWidth / containerWidth;
        
        // Calculate the base scale that "contains" the image in the preview window
        const baseScaleInPreview = visualAspect > tvcLogicalAspect
          ? containerWidth / (pixelData.width * 2)
          : containerHeight / pixelData.height;
          
        customOffset = {
          x: viewTransform.x * scaleFactor,
          y: viewTransform.y * scaleFactor,
          scale: viewTransform.scale / baseScaleInPreview
        };
      }

      const effectiveResMode = (settings.resolutionMode === 'original' && !settings.saveOriginalSize) ? 'tvc' : settings.resolutionMode;

      const result = await processImage(
        sourceImage, 
        paletteToUse, 
        settings.fitMode, 
        settings.ditherMethod,
        settings.adjustments,
        settings.positionX,
        settings.positionY,
        settings.zoom,
        settings.backgroundColor,
        settings.outputMode,
        effectiveResMode,
        settings.invertColors,
        customOffset,
        settings.serpentine,
        settings.perceptualWeighting,
        settings.pixelArtCleaning,
        settings.autoColorSelection,
        settings.disabledPatternPairs ?? [],
        settings.resizeQuality ?? 'sharp',
        settings.preciseAutoColor ?? false,
        settings.patternMixMode ?? 'checker'
      );
      
      // Map indices back to the full 15-color palette if a subset was used
      let finalIndices = result.indices;
      if (settings.selectedColors) {
        finalIndices = new Uint8Array(result.indices.length);
        for (let i = 0; i < result.indices.length; i++) {
          finalIndices[i] = settings.selectedColors[result.indices[i]];
        }
      }

      let rawWidth = 128;
      let rawHeight = 240;
      if (settings.outputMode === 'tvc-4') rawWidth = 256;
      else if (settings.outputMode === 'tvc-2') rawWidth = 512;

      return {
        width: rawWidth,
        height: rawHeight,
        rgba: result.rgba,
        indices: finalIndices,
        originalUrl: sourceImage.src,
        processedUrl: result.url,
        palette: FIXED_PALETTE
      };
    }

    return pixelData;
  };

  const downloadBMP = async (ratio: number = 1) => {
    const dataToSave = await getProcessedDataForSaving();
    if (!dataToSave) return;

    let blob: Blob;
    if (settings.resolutionMode === 'tvc256k') {
      blob = encodeBMP4bpp(dataToSave.width, dataToSave.height, dataToSave.indices, transparencyMask);
    } else {
      blob = encodeBMP(dataToSave.width, dataToSave.height, dataToSave.rgba, ratio, transparencyMask);
    }

    downloadBlob(blob, generateFilename('bmp', ratio));
  };

  // Raw TVC video-RAM dump. Shares the Pixel Editor's encoder so both export
  // paths produce identical bytes (incl. the transparency mask, 9th black).
  const getBinData = (data: PixelData | null): Uint8Array | null => {
    if (!data) return null;
    const mode: TVCEditorMode = settings.resolutionMode === 'tvc256k' ? 'tvc256k' : settings.outputMode;
    const mask = (mode === 'tvc-16' || mode === 'tvc256k') && transparencyMask && transparencyMask.length === data.indices.length
      ? transparencyMask : null;
    return encodeEditorBin(data.width, data.height, data.indices, mask, mode, settings.selectedColors);
  };

  const downloadBin = async () => {
    const dataToSave = await getProcessedDataForSaving();
    const buffer = getBinData(dataToSave);
    if (!buffer) return;

    const blob = new Blob([buffer as any], { type: 'application/octet-stream' });
    downloadBlob(blob, generateFilename('bin'));
  };

  const downloadBinZX7 = async () => {
    const dataToSave = await getProcessedDataForSaving();
    const buffer = getBinData(dataToSave);
    if (!buffer) return;

    const compressed = compressZX7(buffer);
    const blob = new Blob([compressed as any], { type: 'application/octet-stream' });
    downloadBlob(blob, generateFilename('bin.zx7'));
  };

  const reset = () => {
    setState(ProcessingState.IDLE);
    setPixelData(null);
    setSourceImage(null);
    setOriginalBase64(null);
    setShowFullRes(false);
    setInputFilename(null);
    setTransparencyMask(null);
    setMaskedPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isTVC16 = settings.outputMode === TVC_MODES.MODE_16;
  const isTVC4 = settings.outputMode === TVC_MODES.MODE_4;
  const isTVC2 = settings.outputMode === TVC_MODES.MODE_2;
  const isOriginalMode = settings.resolutionMode === 'original';

  // Source image framed like the conversion, for the before/after wipe.
  const compareAvailable = !isOriginalMode && !!pixelData && !!sourceImage;
  useEffect(() => {
    if (!compareMode || !compareAvailable || !sourceImage) { setCompareBeforeUrl(null); return; }
    let cancelled = false;
    let url: string | null = null;
    renderCompositionPreview(sourceImage, settings).then((u) => {
      url = u;
      if (cancelled) { if (u) URL.revokeObjectURL(u); return; }
      setCompareBeforeUrl(u);
    });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [compareMode, compareAvailable, sourceImage, settings.fitMode, settings.zoom, settings.positionX, settings.positionY,
      settings.backgroundColor, settings.outputMode, settings.resolutionMode]);
  const isTVC256k = settings.resolutionMode === 'tvc256k';
  const isAnyTVC = isTVC16 || isTVC4 || isTVC2;
  const isStretch = settings.fitMode === 'stretch';

  const tvcLogicalWidth = isTVC256k ? 256 : (isTVC16 ? 256 : (isTVC4 ? 256 : 512));
  const tvcLogicalHeight = 240;
  const tvcLogicalAspect = tvcLogicalWidth / tvcLogicalHeight;

  // For visual aspect ratio, TVC-16 (128x240) has 2:1 pixels unless TVC256k (256x240 @ 1:1) is selected
  const visualAspect = pixelData ? (((isTVC16 && !isTVC256k) || isOriginalMode) ? (pixelData.width * 2) / pixelData.height : pixelData.width / pixelData.height) : 1;

  const currentDisplayUrl = (pixelData && transparencyMask && maskVisible && maskedPreviewUrl)
    ? maskedPreviewUrl
    : (pixelData?.processedUrl || '');

  if (editorConfig) {
    return (
      <PixelEditor
        key={editorKey}
        width={editorConfig.width}
        height={editorConfig.height}
        pixelAspectX={editorConfig.pixelAspectX}
        palette={FIXED_PALETTE}
        initialIndices={editorConfig.indices}
        mode={editorConfig.mode}
        activeColors={editorConfig.activeColors}
        filenameBase={editorConfig.filenameBase}
        labels={{
          back: t.editorBack,
          pencil: t.editorPencil,
          line: t.editorLine,
          rectangle: t.editorRectangle,
          rectangleFilled: t.editorRectangleFilled,
          ellipse: t.editorEllipse,
          fill: t.editorFill,
          thickness: t.editorThickness,
          colors: t.editorColors,
          primaryColor: t.editorPrimaryColor,
          secondaryColor: t.editorSecondaryColor,
          transparent: t.editorTransparent,
          grid: t.editorGrid,
          preview: t.editorPreview,
          save: t.editorSave,
          saveBin: t.editorSaveBin,
          saveBinZx7: t.editorSaveBinZx7,
          open: t.editorOpen,
          openHint: t.editorOpenHint,
          panHint: t.editorPanHint,
          sizeMismatch: t.editorSizeMismatch,
          unsavedChangesWarning: t.editorUnsavedWarning,
          cancel: t.editorCancel,
          discardAndBack: t.editorDiscardAndBack,
          resetWarning: t.editorResetWarning,
          resetConfirm: t.editorResetConfirm,
          transparencyToggle: t.editorTransparencyToggle,
          checkerFill: t.editorCheckerFill,
          select: t.editorSelect,
          selectConfirm: t.editorSelectConfirm,
          selectCancel: t.editorSelectCancel,
          flipHorizontal: t.editorFlipH,
          flipVertical: t.editorFlipV,
          scrollUp: t.editorScrollUp,
          scrollDown: t.editorScrollDown,
          scrollLeft: t.editorScrollLeft,
          scrollRight: t.editorScrollRight,
          recolorSlot: t.editorRecolorSlot,
          recolorHint: t.editorRecolorHint,
          unrecognizedFile: t.editorUnrecognizedFile,
          openError: t.editorOpenError,
          binSizeMismatchTitle: t.editorBinSizeMismatchTitle,
          binSizeMismatchHint: t.editorBinSizeMismatchHint,
          load: t.editorLoad,
          text: t.editorText,
          textPlaceholder: t.editorTextPlaceholder,
          textSize: t.editorTextSize,
          textFont: t.editorTextFont,
          textBold: t.editorTextBold,
          textHint: t.editorTextHint,
          stamp: t.editorStamp,
          copy: t.editorCopy,
          paste: t.editorPaste
        }}
        lang={lang}
        onLangChange={(l) => setLang(l as Language)}
        onBack={closeEditor}
        onSaveBMP={handleEditorSaveBMP}
        onSaveBIN={handleEditorSaveBIN}
        onSaveBINZX7={handleEditorSaveBINZX7}
        onImageLoaded={handleEditorImageLoaded}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <AppHeader
        t={t}
        lang={lang}
        onLangChange={setLang}
        onShowManual={() => setShowManual(true)}
        showNewButton={state === ProcessingState.COMPLETED || state === ProcessingState.ERROR}
        onNew={reset}
      />

      <main className="max-w-7xl mx-auto px-4 pb-4 pt-[3px] md:px-8 md:pb-8 md:pt-[3px]">
        {state === ProcessingState.IDLE && (
          <div className="max-w-2xl mx-auto mt-12 md:mt-24 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="mb-8 inline-flex p-4 rounded-full bg-blue-500/10 border border-blue-500/20">
              <ImageIcon className="text-blue-500" size={48} />
            </div>
            <h2 className="text-4xl font-extrabold text-white mb-4 leading-tight" dangerouslySetInnerHTML={{ __html: t.introTitle }}></h2>
            <p className="text-slate-400 text-lg mb-10 leading-relaxed" dangerouslySetInnerHTML={{ __html: t.introDesc }}></p>
            
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`group relative cursor-pointer border-2 border-dashed rounded-2xl p-12 transition-all duration-300 shadow-2xl ${isDragOver ? 'border-blue-500 bg-blue-500/10 scale-[1.02]' : 'border-slate-700 hover:border-blue-500/50 hover:bg-slate-900/40'}`}
              title={t.ttSelectImage}
            >
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Upload className="text-slate-400 group-hover:text-blue-500" />
                </div>
                <p className="text-slate-300 font-medium text-lg">{t.selectImage}</p>
                <p className="text-slate-500 text-sm mt-2 font-mono">{t.autoConversion}</p>
                <p className="text-slate-500 text-xs mt-1">{t.pasteHint}</p>
                
                <div 
                  onClick={(e) => { e.stopPropagation(); setAutoCropBorder(!autoCropBorder); }}
                  className="mt-6 inline-flex items-center space-x-2.5 px-4 py-2 bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 rounded-xl cursor-pointer transition-colors shadow-md z-10"
                  title={t.ttAutoCropBorder || "A betöltött kép körüli egyszínű keret (bal felső pixel alapján) automatikus eltávolítása"}
                >
                  <input 
                    type="checkbox" 
                    checked={autoCropBorder} 
                    onChange={() => {}} 
                    className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-900 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-200 select-none">
                    {t.autoCropBorder || "Keret automatikus levágása (bal felső pixel alapján)"}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs">
              <button onClick={() => openBlankEditor('tvc-16')} className="text-slate-500 hover:text-blue-400 underline decoration-dotted">
                {t.editorOpenBlank16 || 'Open blank 16-color editor (128x240)'}
              </button>
              <span className="text-slate-700">|</span>
              <button onClick={() => openBlankEditor('tvc-4')} className="text-slate-500 hover:text-blue-400 underline decoration-dotted">
                {t.editorOpenBlank4 || 'Open blank 4-color editor (256x240)'}
              </button>
              <span className="text-slate-700">|</span>
              <button onClick={() => openBlankEditor('tvc-2')} className="text-slate-500 hover:text-blue-400 underline decoration-dotted">
                {t.editorOpenBlank2 || 'Open blank 2-color editor (512x240)'}
              </button>
              <span className="text-slate-700">|</span>
              <button onClick={() => openBlankEditor('tvc256k')} className="text-slate-500 hover:text-blue-400 underline decoration-dotted">
                {t.editorOpenBlank256k || 'Open blank 256k editor (256x240)'}
              </button>
            </div>
          </div>
        )}

        {(state === ProcessingState.PROCESSING || state === ProcessingState.COMPLETED) && originalBase64 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-500">
            <div className="lg:col-span-4 order-2 lg:order-1">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6 max-h-[85vh] lg:max-h-none overflow-y-auto custom-scrollbar">
                
                <div className="space-y-4 bg-slate-800/30 p-4 rounded-xl border border-slate-800/50">
                  <ControlGroup title={t.outputRes} icon={<Monitor size={14} className="text-blue-400" />} className="space-y-3" contentClassName="space-y-2">
                     <div className="grid grid-cols-3 gap-2">
                        <button 
                          onClick={() => handleModeChange('tvc-16')}
                          className={`py-2 px-3 text-xs rounded-lg border transition-all mono uppercase tracking-tight ${isTVC16 ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-bold' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                          title={t.tt16Colors}
                        >
                          {(t as any).tvc16Mode || '16 Colors'}
                        </button>
                        <button 
                          onClick={() => handleModeChange('tvc-4')}
                          className={`py-2 px-3 text-xs rounded-lg border transition-all mono uppercase tracking-tight ${isTVC4 ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-bold' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                          title={t.tt4Colors}
                        >
                          {(t as any).tvc4Mode || '4 Colors'}
                        </button>
                        <button 
                          onClick={() => handleModeChange('tvc-2')}
                          className={`py-2 px-3 text-xs rounded-lg border transition-all mono uppercase tracking-tight ${isTVC2 ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-bold' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                          title={t.tt2Colors}
                        >
                          {(t as any).tvc2Mode || '2 Colors'}
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <button 
                          onClick={() => {
                            setViewTransform({ x: 0, y: 0, scale: 1 });
                            handleSettingChange({ resolutionMode: 'original' });
                          }}
                          className={`py-2 px-2 text-xs rounded-lg border transition-all mono uppercase tracking-tight ${isOriginalMode ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-bold' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                          title={t.ttOriginalMode}
                        >
                          {t.originalMode}
                        </button>
                        <button 
                          onClick={() => handleSettingChange({ resolutionMode: 'tvc' })}
                          className={`py-2 px-2 text-xs rounded-lg border transition-all mono uppercase tracking-tight ${!isOriginalMode && !isTVC256k ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-bold' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                          title={t.ttFullScreenMode}
                        >
                          {(t as any).fullScreenMode || 'Full Screen'}
                        </button>
                        <button 
                          onClick={() => handleSettingChange({ resolutionMode: 'tvc256k' })}
                          className={`py-2 px-2 text-xs rounded-lg border transition-all mono uppercase tracking-tight ${isTVC256k ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-bold' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                          title={(t as any).ttTVC256kMode || "TVC256k++ mód: 16 színű, 256x240 felbontású, 1:1 pixel arányú üzemmód"}
                        >
                          TVC256k++
                        </button>
                      </div>

                      {isOriginalMode && (
                        <div className="mt-3 p-2 bg-slate-800/50 rounded-lg border border-slate-700/50 space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-400 uppercase tracking-wider mb-1">
                            <span>{t.saveOriginalSize}</span>
                            <Info size={12} className="text-slate-500" />
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            <button 
                              onClick={() => handleSettingChange({ saveOriginalSize: true })}
                              className={`py-1.5 px-2 text-[11px] rounded border transition-all mono uppercase tracking-tighter ${settings.saveOriginalSize ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 font-bold' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                              title={(t as any).ttSaveOriginalSizeBtn}
                            >
                              {t.originalMode}
                            </button>
                            <button 
                              onClick={() => handleSettingChange({ saveOriginalSize: false })}
                              className={`py-1.5 px-2 text-[11px] rounded border transition-all mono uppercase tracking-tighter ${!settings.saveOriginalSize ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-bold' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                              title={(t as any).ttSaveCompositionBtn}
                            >
                              {t.composition}
                            </button>
                          </div>
                        </div>
                      )}
                  </ControlGroup>

                  {renderColorSelectors()}

                  <ControlGroup
                    title={t.ditherMethod}
                    icon={<Zap size={14} className="text-yellow-500" />}
                    className="space-y-3"
                    contentClassName="space-y-2"
                    extra={sourceImage && (
                      <button
                        onClick={() => setShowDitherGrid(true)}
                        className="text-[10px] text-slate-400 hover:text-blue-400 flex items-center gap-1 mono uppercase"
                        title={t.ttDitherGrid}
                      >
                        <LayoutGrid size={12} />
                      </button>
                    )}
                  >
                    <div className="grid grid-cols-1 gap-2">
                      <select 
                        value={settings.ditherMethod}
                        onChange={(e) => handleSettingChange({ ditherMethod: e.target.value as DitherMethod })}
                        className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg p-2 text-sm focus:outline-none focus:border-blue-500 mono"
                      >
                      {ditherOptionGroups(t).map((group, gi) => {
                        const options = group.items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>);
                        return group.label === null
                          ? <React.Fragment key={gi}>{options}</React.Fragment>
                          : <optgroup key={gi} label={group.label} className="bg-slate-900 text-slate-400">{options}</optgroup>;
                      })}
                    </select>
                  </div>
                </ControlGroup>
                </div>

                <ControlGroup 
                  title={t.adjustments} 
                  icon={<Sun size={14} className="text-blue-500" />}
                  contentClassName="space-y-2.5"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-1">
                    {(['tvc-16', 'tvc-4', 'tvc-2'] as const).filter(m => m !== currentMode).map(mode => (
                      <button 
                        key={mode}
                        onClick={() => handleAdjustmentChange(settingsMap[mode].adjustments)}
                        className="text-[9px] sm:text-[10px] text-slate-500 hover:text-blue-400 flex items-center space-x-1 mono uppercase tracking-tighter whitespace-nowrap flex-shrink-0"
                        title={(t as any).ttCopyFrom ? (t as any).ttCopyFrom(mode.replace('tvc-', '')) : `Copy from ${mode.replace('tvc-', '')}`}
                      >
                        <Copy size={10} />
                        <span>{mode.replace('tvc-', '')}c</span>
                      </button>
                    ))}
                     <button 
                      onClick={() => handleAutoTune('artistic')}
                      className="text-[9px] sm:text-[10px] text-slate-500 hover:text-blue-400 flex items-center space-x-1 mono uppercase tracking-tighter whitespace-nowrap flex-shrink-0"
                      title={t.ttAutoDetect || "Automata 1 (TVC Stílus): Autentikus retro TVC képi megjelenés"}
                    >
                      <Wand2 size={10} />
                      <span>A1</span>
                    </button>
                    <button 
                      onClick={() => handleAutoTune('fidelity')}
                      className="text-[9px] sm:text-[10px] text-slate-500 hover:text-amber-400 flex items-center space-x-1 mono uppercase tracking-tighter whitespace-nowrap flex-shrink-0"
                      title={t.ttAutoTuneFidelity || "Automata 2 (Hűség): Maximális hasonlóság az eredeti nem módosított képre"}
                    >
                      <Sparkles size={10} className="text-amber-400" />
                      <span>A2</span>
                    </button>
                    <button 
                      onClick={() => handleAutoTune('flat')}
                      className="text-[9px] sm:text-[10px] text-slate-500 hover:text-emerald-400 flex items-center space-x-1 mono uppercase tracking-tighter whitespace-nowrap flex-shrink-0"
                      title={t.ttAutoTuneFlat || "Automata 3 (Tiszta Pixel Art): Sík színfelületek, dithering-zaj nélkül - kézzel pixelezett hatás"}
                    >
                      <Filter size={10} className="text-emerald-400" />
                      <span>A3</span>
                    </button>
                    <button 
                      onClick={() => handleAutoTune('precision')}
                      className="text-[9px] sm:text-[10px] text-slate-500 hover:text-cyan-400 flex items-center space-x-1 mono uppercase tracking-tighter whitespace-nowrap flex-shrink-0"
                      title={t.ttAutoTunePrecision || "Automata 4 (Precizitás): Valódi strukturális hasonlóság (SSIM) alapú pontszámozás, kézzel belőtt szorzók helyett"}
                    >
                      <Maximize size={10} className="text-cyan-400" />
                      <span>A4</span>
                    </button>
                    <button
                      onClick={undoSettings}
                      disabled={!settingsHistory.canUndo}
                      className="text-[9px] sm:text-[10px] text-slate-500 hover:text-blue-400 disabled:opacity-30 disabled:pointer-events-none flex items-center mono flex-shrink-0"
                      title={t.ttUndo}
                    >
                      <Undo2 size={10} />
                    </button>
                    <button
                      onClick={redoSettings}
                      disabled={!settingsHistory.canRedo}
                      className="text-[9px] sm:text-[10px] text-slate-500 hover:text-blue-400 disabled:opacity-30 disabled:pointer-events-none flex items-center mono flex-shrink-0"
                      title={t.ttRedo}
                    >
                      <Redo2 size={10} />
                    </button>
                    <button 
                      onClick={resetAdjustments}
                      className="text-[9px] sm:text-[10px] text-slate-500 hover:text-blue-400 flex items-center space-x-1 mono uppercase tracking-tighter whitespace-nowrap flex-shrink-0"
                      title={t.ttReset}
                    >
                      <RotateCcw size={10} />
                    </button>
                  </div>
                  <Slider 
                    label={t.brightness} icon={<Sun size={12}/>} 
                    value={settings.adjustments.brightness} min={-100} max={100} step={1}
                    onChange={(v) => handleAdjustmentChange({ brightness: v })}
                    titles={sliderTitles}
                  />
                  <Slider 
                    label={t.contrast} icon={<Contrast size={12}/>} 
                    value={settings.adjustments.contrast} min={-100} max={200} step={1}
                    onChange={(v) => handleAdjustmentChange({ contrast: v })}
                    titles={sliderTitles}
                  />
                  <Slider 
                    label={t.saturation} icon={<PaletteIcon size={12}/>} 
                    value={settings.adjustments.saturation} min={0} max={400} step={1}
                    onChange={(v) => handleAdjustmentChange({ saturation: v })}
                    titles={sliderTitles}
                  />
                  <Slider
                    label={t.hue} icon={<Rainbow size={12}/>}
                    value={settings.adjustments.hue ?? 0} min={-180} max={180} step={1}
                    onChange={(v) => handleAdjustmentChange({ hue: v })}
                    titles={sliderTitles}
                    suffix="°"
                  />
                  <Slider
                    label={t.temperature} icon={<Thermometer size={12}/>}
                    value={settings.adjustments.temperature ?? 0} min={-100} max={100} step={1}
                    onChange={(v) => handleAdjustmentChange({ temperature: v })}
                    titles={sliderTitles}
                  />
                  <Slider 
                    label={t.gamma} icon={<Zap size={12}/>} 
                    value={settings.adjustments.gamma} min={0.1} max={6.0} step={0.1}
                    onChange={(v) => handleAdjustmentChange({ gamma: v })}
                    titles={sliderTitles}
                  />
                  <div className="pt-2 border-t border-slate-800/50 space-y-2.5">
                    <Slider 
                      label={t.denoise || "Denoising"} icon={<Filter size={12}/>} 
                      value={settings.adjustments.denoise ?? 0} min={0} max={100} step={1}
                      onChange={(v) => handleAdjustmentChange({ denoise: v })}
                      titles={sliderTitles}
                      suffix="%"
                    />
                    <Slider 
                      label={t.unsharpMask || "Unsharp Mask"} icon={<Maximize size={12}/>} 
                      value={settings.adjustments.unsharpMask ?? 0} min={0} max={100} step={1}
                      onChange={(v) => handleAdjustmentChange({ unsharpMask: v })}
                      titles={sliderTitles}
                      suffix="%"
                    />
                    <Slider 
                      label={t.toneMapping || "Tone Mapping"} icon={<ArrowLeftRight size={12}/>} 
                      value={settings.adjustments.toneMapping ?? 0} min={0} max={100} step={1}
                      onChange={(v) => handleAdjustmentChange({ toneMapping: v })}
                      titles={sliderTitles}
                      suffix="%"
                    />
                  </div>
                </ControlGroup>

                <ControlGroup 
                  title={t.advancedSettings || "Advanced Settings"} 
                  icon={<Sparkles size={14} className="text-emerald-500" />}
                  contentClassName="space-y-3"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center justify-between p-2 rounded bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors" title={t.ttSerpentine}>
                      <span className="text-[10px] text-slate-300 truncate mr-2">{t.serpentine}</span>
                      <input 
                        type="checkbox" 
                        checked={settings.serpentine} 
                        onChange={(e) => handleSettingChange({ serpentine: e.target.checked })}
                        className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900 shrink-0"
                      />
                    </label>
                    <label className="flex items-center justify-between p-2 rounded bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors" title={t.ttPerceptualWeighting}>
                      <span className="text-[10px] text-slate-300 truncate mr-2">{t.perceptualWeighting}</span>
                      <input 
                        type="checkbox" 
                        checked={settings.perceptualWeighting} 
                        onChange={(e) => handleSettingChange({ perceptualWeighting: e.target.checked })}
                        className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900 shrink-0"
                      />
                    </label>
                    <label className="flex items-center justify-between p-2 rounded bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors" title={t.ttPixelArtCleaning}>
                      <span className="text-[10px] text-slate-300 truncate mr-2">{t.pixelArtCleaning}</span>
                      <input 
                        type="checkbox" 
                        checked={settings.pixelArtCleaning} 
                        onChange={(e) => handleSettingChange({ pixelArtCleaning: e.target.checked })}
                        className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900 shrink-0"
                      />
                    </label>
                    <label className={`flex items-center justify-between p-2 rounded bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors ${currentMode === 'tvc-16' ? 'opacity-30 pointer-events-none' : ''}`} title={t.ttAutoColorSelection}>
                      <span className="text-[10px] text-slate-300 truncate mr-2">{t.autoColorSelection}</span>
                      <input 
                        type="checkbox" 
                        checked={settings.autoColorSelection} 
                        onChange={(e) => handleSettingChange({ autoColorSelection: e.target.checked })}
                        disabled={currentMode === 'tvc-16'}
                        className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900 shrink-0"
                      />
                    </label>
                    <label className={`flex items-center justify-between p-2 rounded bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors ${(!settings.autoColorSelection || currentMode === 'tvc-16') ? 'opacity-30 pointer-events-none' : ''}`} title={t.ttPreciseAutoColor || 'Uses CIELAB (perceptually uniform) color distance instead of the usual redmean approximation when picking the best colors. Only affects this one-time color selection, not the per-pixel dithering - safe to leave on.'}>
                      <span className="text-[10px] text-slate-300 truncate mr-2">{t.preciseAutoColor || 'Precise Auto Color (Lab)'}</span>
                      <input 
                        type="checkbox" 
                        checked={settings.preciseAutoColor ?? false} 
                        onChange={(e) => handleSettingChange({ preciseAutoColor: e.target.checked })}
                        disabled={!settings.autoColorSelection || currentMode === 'tvc-16'}
                        className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900 shrink-0"
                      />
                    </label>
                    <label className={`flex items-center justify-between p-2 rounded bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors ${!(settings.ditherMethod === 'pattern-tvc' || settings.ditherMethod === 'pattern-tvc-diffusion') ? 'opacity-30 pointer-events-none' : ''}`} title={t.ttPatternMixScanline || 'Pattern TVC blends its two colors in alternating rows instead of a checkerboard. On the 16-color mode 2:1 pixels this often blends more smoothly.'}>
                      <span className="text-[10px] text-slate-300 truncate mr-2">{t.patternMixScanline || 'Scanline Mix'}</span>
                      <input 
                        type="checkbox" 
                        checked={settings.patternMixMode === 'scanline'} 
                        onChange={(e) => handleSettingChange({ patternMixMode: e.target.checked ? 'scanline' : 'checker' })}
                        disabled={!(settings.ditherMethod === 'pattern-tvc' || settings.ditherMethod === 'pattern-tvc-diffusion')}
                        className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900 shrink-0"
                      />
                    </label>
                    <label className="flex items-center justify-between p-2 rounded bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors" title={t.ttResizeQuality || 'Gamma-correct area-average downscale (cleaner on photos, but slower). Off = the original fast nearest-neighbor resize.'}>
                      <span className="text-[10px] text-slate-300 truncate mr-2">{t.resizeQuality || 'Smooth Resize'}</span>
                      <input 
                        type="checkbox" 
                        checked={settings.resizeQuality === 'smooth'} 
                        onChange={(e) => handleSettingChange({ resizeQuality: e.target.checked ? 'smooth' : 'sharp' })}
                        className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900 shrink-0"
                      />
                    </label>
                  </div>
                </ControlGroup>

                <ControlGroup 
                  title={t.saveSettings} 
                  icon={<Copy size={14} className="text-emerald-500" />}
                  contentClassName="space-y-2.5"
                >
                  <div className="grid grid-cols-2 gap-4 divide-x divide-slate-800">
                    <div className="pr-2">
                      <div className="text-[10px] text-slate-400 mb-1.5">{t.saveSettings}</div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[1, 2, 3].map(slot => (
                          <Button key={slot} onClick={() => saveSettingsToSlot(slot)} className="w-full py-1 text-[10px] relative">
                            {slot}
                          </Button>
                        ))}
                        <Button onClick={exportSettingsToFile} className="w-full py-1 text-[10px] relative" title={t.exportSettingsHint || `Save settings to a text file (${SETTINGS_FILE_EXTENSION}) with a name you choose`}>
                          <Download size={12} />
                        </Button>
                      </div>
                    </div>
                    <div className="pl-2">
                      <div className="text-[10px] text-slate-400 mb-1.5">{t.loadSettings}</div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[1, 2, 3].map(slot => (
                          <div key={slot} className="relative group">
                            <Button onClick={() => loadSettingsFromSlot(slot)} className="w-full py-1 text-[10px]" disabled={!savedSlots[slot]}>{slot}</Button>
                            {savedSlots[slot] && (
                              <button 
                                onClick={() => deleteSettingsFromSlot(slot)}
                                className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
                                title={(t as any).ttDelete || 'Delete'}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                        <Button onClick={handleImportSettingsClick} className="w-full py-1 text-[10px]" title={t.importSettingsHint || `Load settings from a ${SETTINGS_FILE_EXTENSION} text file`}>
                          <Upload size={12} />
                        </Button>
                        <input ref={settingsFileInputRef} type="file" accept={`${SETTINGS_FILE_EXTENSION},.json,text/plain`} className="hidden" onChange={importSettingsFromFile} />
                      </div>
                    </div>
                  </div>
                </ControlGroup>

              </div>
            </div>

            <div className="lg:col-span-8 space-y-8 order-1 lg:order-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                {/* Source Preview */}
                <div className="space-y-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-mono block">{t.sourcePreview}</span>
                  <div className="w-full aspect-square bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative">
                    {!!settings.adjustments.temperature && <TemperatureFilter temperature={settings.adjustments.temperature} />}
                    <img 
                      src={originalBase64} 
                      alt="Adjusted" 
                      className="w-full h-full object-contain"
                      style={{
                        filter: `${settings.adjustments.temperature ? 'url(#tvc-temperature) ' : ''}${settings.adjustments.hue ? `hue-rotate(${settings.adjustments.hue}deg) ` : ''}brightness(${1 + settings.adjustments.brightness/100}) contrast(${1 + settings.adjustments.contrast/100}) saturate(${settings.adjustments.saturation}%)`
                      }}
                    />
                  </div>
                  <div className="text-center text-[10px] text-slate-400 mono mt-1 break-all flex items-center justify-center gap-1.5 flex-wrap">
                    <span>{generateFilename('png').replace('.png', '')}</span>
                    {sourceImage && (
                      <span className="text-slate-400 font-semibold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                        ({sourceImage.naturalWidth || sourceImage.width} × {sourceImage.naturalHeight || sourceImage.height} px)
                      </span>
                    )}
                  </div>
                </div>

                {/* Result Preview */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500 font-mono">
                      {isTVC16 ? ((t as any).tvc16Mode || '16 Colors') : isTVC4 ? ((t as any).tvc4Mode || '4 Colors') : isTVC2 ? ((t as any).tvc2Mode || '2 Colors') : ''} - {isOriginalMode ? t.originalMode : isTVC256k ? 'TVC256k++' : ((t as any).fullScreenMode || 'Full Screen')}
                    </span>
                  </div>
                  
                  <div 
                    ref={resultContainerCallbackRef}
                    className="w-full border-4 border-slate-800 rounded-xl overflow-hidden shadow-2xl shadow-blue-900/10 flex items-center justify-center relative group touch-none transition-colors"
                    style={{ 
                      aspectRatio: (isOriginalMode && settings.saveOriginalSize) ? '1 / 1' : `${tvcLogicalAspect}`,
                      backgroundColor: settings.backgroundColor 
                    }}
                    onMouseDown={handleDragStart}
                    onMouseMove={handleDragMove}
                    onMouseUp={handleDragEnd}
                    onMouseLeave={() => handleDragEnd()}
                    onTouchStart={handleDragStart}
                    onTouchMove={handleDragMove}
                    onTouchEnd={handleDragEnd}
                    onWheel={handleWheel}
                  >
                    <div className="absolute top-2 right-2 z-10 flex gap-2">
                        {transparencyMask && (
                          <button 
                            onClick={handleToggleMaskVisibility}
                            className={`p-2 rounded-full transition-colors shadow-lg backdrop-blur-sm ${
                              maskVisible 
                                ? 'bg-pink-600 hover:bg-pink-500 text-white ring-2 ring-pink-400' 
                                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400'
                            }`}
                            title={t.ttMaskVisibility || "Átlátszó háttér megjelenítése"}
                          >
                            {maskVisible ? <Sparkles size={20} className="text-pink-200" /> : <EyeOff size={20} />}
                          </button>
                        )}
                        {compareAvailable && (
                          <button
                            onClick={() => setCompareMode((v) => !v)}
                            className={`p-2 rounded-full transition-colors shadow-lg backdrop-blur-sm ${compareMode ? 'bg-blue-600 hover:bg-blue-500 text-white ring-2 ring-blue-400' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200'}`}
                            title={t.ttCompare}
                            aria-pressed={compareMode}
                          >
                            <Columns2 size={20} />
                          </button>
                        )}
                        <button 
                          onClick={() => setShowTheaterMode(true)}
                          className="bg-slate-800/80 hover:bg-slate-700 p-2 rounded-full text-slate-200 transition-colors shadow-lg backdrop-blur-sm"
                          title={t.ttViewFullscreen}
                        >
                          <Expand size={20} />
                        </button>
                        <button 
                          onClick={() => setShowFullRes(true)}
                          className="bg-slate-800/80 hover:bg-slate-700 p-2 rounded-full text-slate-200 transition-colors shadow-lg backdrop-blur-sm"
                          title={t.ttViewScale}
                        >
                          <Eye size={20} />
                        </button>
                    </div>

                    {pixelData && (
                      <div 
                        className={`w-full h-full relative ${isDragging ? 'cursor-grabbing' : 'cursor-move'} flex items-center justify-center`}
                        style={{ backgroundColor: settings.backgroundColor }}
                      >
                        {compareMode && compareBeforeUrl && !isOriginalMode ? (
                          <div
                            className="relative"
                            style={{
                              width: visualAspect > 1 ? '100%' : 'auto',
                              height: visualAspect <= 1 ? '100%' : 'auto',
                              maxWidth: '100%',
                              maxHeight: '100%',
                              aspectRatio: `${visualAspect}`
                            }}
                          >
                            <img
                              src={currentDisplayUrl}
                              alt="Pixelated"
                              className="pixelated w-full h-full pointer-events-none select-none"
                            />
                            <CompareOverlay
                              beforeUrl={compareBeforeUrl}
                              position={comparePosition}
                              onPositionChange={setComparePosition}
                              beforeLabel={t.compareBefore}
                              afterLabel={t.compareAfter}
                              sliderTitle={t.compareDivider}
                            />
                          </div>
                        ) : (
                          <img 
                            src={currentDisplayUrl} 
                            alt="Pixelated" 
                            className={`pixelated transition-transform duration-300 scale-100 pointer-events-none select-none`}
                            style={{
                                maxWidth: isOriginalMode ? 'none' : '100%',
                                maxHeight: isOriginalMode ? 'none' : '100%',
                                // Visual Aspect Ratio logic:
                                // width is raw pixels * 2. 
                                width: isOriginalMode ? `${pixelData.width * 2}px` : (visualAspect > 1 ? '100%' : 'auto'),
                                height: isOriginalMode ? `${pixelData.height}px` : (visualAspect <= 1 ? '100%' : 'auto'),
                                aspectRatio: `${visualAspect}`,
                                transform: isOriginalMode 
                                  ? `translate(${viewTransform.x}px, ${viewTransform.y}px) scale(${viewTransform.scale})` 
                                  : 'none',
                                transformOrigin: 'center center'
                            }}
                          />
                        )}
                      </div>
                    )}
                    {!pixelData && <div className="text-slate-600 mono">{t.noData}</div>}
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-slate-500 mono">
                     <div className="flex items-center gap-2">
                       <span>{pixelData ? `${pixelData.width} x ${pixelData.height}` : '-'}</span>
                       {transparencyMask && (
                         <span className="text-pink-400 font-bold bg-pink-950/60 px-1.5 py-0.5 rounded border border-pink-800/50 text-[10px]">
                           {(() => {
                             let count = 0;
                             for (let i = 0; i < transparencyMask.length; i++) if (transparencyMask[i] === 1) count++;
                             const pct = (count / transparencyMask.length) * 100;
                             return `${count.toLocaleString()} px (${pct.toFixed(1)}%) ${lang === 'hu' ? 'átlátszó' : 'transparent'}`;
                           })()}
                         </span>
                       )}
                     </div>
                     <div className="flex items-center gap-2.5">
                       <span className="italic">{isDragging ? (lang === 'hu' ? 'Mozgatás...' : 'Moving...') : (isOriginalMode ? t.panZoom : t.dragHelper)}</span>
                       {(settings.outputMode === 'tvc-16' || settings.outputMode === 'tvc-4' || settings.outputMode === 'tvc-2') && !isOriginalMode && pixelData && (
                         <button
                           onClick={openEditorFromResult}
                           disabled={state === ProcessingState.PROCESSING}
                           title={t.editorOpenHint}
                           className="flex items-center gap-1 px-2 py-0.5 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 not-italic disabled:opacity-40 disabled:pointer-events-none"
                         >
                           <Pencil size={11} />
                           <span>{t.editorEditButton || 'Pixel Editor'}</span>
                         </button>
                       )}
                     </div>
                  </div>
                </div>
              </div>

              {/* L-Shaped Composition Panel */}
              <div className="grid grid-cols-1 md:grid-cols-9 gap-6 items-stretch">
                 {/* Left Side: Composition Controls and Background Color */}
                 <div className="md:col-span-4 flex flex-col gap-6">
                     <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2 gap-2">
                          <div className="flex items-center space-x-1.5 text-slate-100 shrink-0">
                             <Move size={15} className="text-emerald-500" />
                             <h3 className="font-bold text-[10px] uppercase tracking-wider">{t.composition}</h3>
                          </div>
                          <div className="flex items-center space-x-1.5 flex-nowrap shrink-0">
                            <button
                              onClick={transparencyMask ? handleClearMask : handleGenerateMask}
                              className={`text-[10px] flex items-center space-x-1 mono uppercase tracking-tighter transition-colors px-2 py-0.5 rounded border shrink-0 ${
                                transparencyMask 
                                  ? 'bg-pink-600/30 border-pink-500 text-pink-300 hover:bg-pink-600/40' 
                                  : 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700/60 text-slate-400 hover:text-pink-400'
                              }`}
                              title={transparencyMask ? (t.ttClearMask || "Maszk törlése") : (t.ttGenerateMask || "Átlátszó háttér maszkolása")}
                            >
                              <Sparkles size={11} className={transparencyMask ? "text-pink-400" : "text-slate-400"} />
                              <span>{transparencyMask ? (t.clearMask || "Törlés") : (t.generateMask || "Maszk")}</span>
                            </button>

                            <button
                              onClick={handleTrimBorder}
                              className="text-[10px] text-slate-400 hover:text-emerald-400 flex items-center space-x-1 mono uppercase tracking-tighter transition-colors bg-slate-800/80 hover:bg-slate-700/80 px-2 py-0.5 rounded border border-slate-700/60 shrink-0"
                              title={t.ttTrimBorderBtn || "Körülötte lévő egyszínű keret eltávolítása a bal felső pixel alapján"}
                            >
                              <Crop size={11} className="text-emerald-400" />
                              <span>{t.trimBorderBtn || "Keret"}</span>
                            </button>
                            <button 
                              onClick={() => {
                                if (isOriginalMode) {
                                  setViewTransform(prev => ({ ...prev, x: 0, y: 0 }));
                                }
                                handleSettingChange({ positionX: 50, positionY: 50 });
                              }}
                              disabled={!isOriginalMode && isStretch}
                              className="text-[10px] text-slate-400 hover:text-blue-400 flex items-center space-x-1 mono uppercase tracking-tighter bg-slate-800/80 hover:bg-slate-700/80 px-2 py-0.5 rounded border border-slate-700/60 transition-colors disabled:opacity-30 disabled:pointer-events-none shrink-0"
                              title={t.ttCenterImage}
                            >
                              <Move size={11} className="text-blue-400" />
                              <span>{t.centerImage}</span>
                            </button>
                          </div>
                        </div>
                        
                        <div className={`grid grid-cols-3 gap-2 ${isOriginalMode && settings.saveOriginalSize ? 'opacity-50 pointer-events-none' : ''}`}>
                          <button 
                            onClick={() => handleSettingChange({ fitMode: 'cover' })}
                            disabled={isOriginalMode && settings.saveOriginalSize}
                            className={`py-2 px-2 text-[10px] rounded-lg border transition-all mono uppercase tracking-tight ${settings.fitMode === 'cover' ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-bold' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                            title={t.ttCropFill}
                          >
                            {t.cropFill}
                          </button>
                          <button 
                            onClick={() => handleSettingChange({ fitMode: 'contain' })}
                            disabled={isOriginalMode && settings.saveOriginalSize}
                            className={`py-2 px-2 text-[10px] rounded-lg border transition-all mono uppercase tracking-tight ${settings.fitMode === 'contain' ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-bold' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                            title={t.ttLetterbox}
                          >
                            {t.letterbox}
                          </button>
                            <button 
                            onClick={() => handleSettingChange({ fitMode: 'stretch' })}
                            disabled={isOriginalMode && settings.saveOriginalSize}
                            className={`py-2 px-2 text-[10px] rounded-lg border transition-all mono uppercase tracking-tight ${settings.fitMode === 'stretch' ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-bold' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                            title={t.ttStretchFill}
                          >
                            {t.stretchFill}
                          </button>
                        </div>

                        <div className="space-y-2">
                            <Slider 
                              label={t.zoom} icon={<Maximize size={12}/>} 
                              value={isOriginalMode ? viewTransform.scale : settings.zoom} 
                              min={0.1} max={10.0} step={0.1}
                              onChange={(v) => {
                                if (isOriginalMode) {
                                  setViewTransform(prev => ({ ...prev, scale: v }));
                                }
                                handleSettingChange({ zoom: v });
                              }}
                              disabled={!isOriginalMode && isStretch}
                              titles={sliderTitles}
                            />
                            <div className="space-y-2">
                                <Slider 
                                  label={t.hPos} icon={<Move size={12}/>} 
                                  value={isOriginalMode ? viewTransform.x : settings.positionX} 
                                  min={isOriginalMode ? -2000 : 0} max={isOriginalMode ? 2000 : 100} step={1}
                                  onChange={(v) => {
                                    if (isOriginalMode) {
                                      setViewTransform(prev => ({ ...prev, x: v }));
                                    } else {
                                      handleSettingChange({ positionX: v });
                                    }
                                  }}
                                  disabled={!isOriginalMode && isStretch}
                                  suffix={isOriginalMode ? "px" : "%"}
                                  titles={sliderTitles}
                                />
                                <Slider 
                                  label={t.vPos} icon={<Move size={12} className="rotate-90"/>} 
                                  value={isOriginalMode ? viewTransform.y : settings.positionY} 
                                  min={isOriginalMode ? -2000 : 0} max={isOriginalMode ? 2000 : 100} step={1}
                                  onChange={(v) => {
                                    if (isOriginalMode) {
                                      setViewTransform(prev => ({ ...prev, y: v }));
                                    } else {
                                      handleSettingChange({ positionY: v });
                                    }
                                  }}
                                  disabled={!isOriginalMode && isStretch}
                                  suffix={isOriginalMode ? "px" : "%"}
                                  titles={sliderTitles}
                                />
                            </div>
                        </div>
                     </div>
                     
                     <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xl flex flex-col justify-center">
                         <div className="flex items-center space-x-2 text-slate-100 mb-2 border-b border-slate-800 pb-2">
                             <PaletteIcon size={14} className="text-slate-400" />
                             <span className="font-bold text-[10px] uppercase tracking-wider">{t.bgFill}</span>
                         </div>
                         
                         <div className="grid grid-cols-8 gap-1 auto-rows-min">
                            {FIXED_PALETTE.map((color) => (
                              <button
                                key={color}
                                onClick={() => handleSettingChange({ backgroundColor: color })}
                                className={`h-4 rounded-sm border ${settings.backgroundColor === color ? 'border-white scale-105 shadow-lg shadow-black/50 z-10' : 'border-transparent hover:border-slate-600 hover:scale-105'} transition-all`}
                                style={{ backgroundColor: color }}
                                title={t.colorNames ? t.colorNames[FIXED_PALETTE.indexOf(color)] : color}
                              />
                            ))}
                         </div>
                     </div>
                 </div>
                 
                 {/* Right Side: Advanced Settings, Dither Tuning, Save Buttons */}
                 <div className="md:col-span-5 flex flex-col gap-4">
                     <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                        <ControlGroup 
                          title={t.ditherTuning} 
                          icon={<Wand2 size={14} className="text-purple-500" />}
                          contentClassName="space-y-2.5"
                        >
                          <Slider 
                            label={t.ditherAmount} icon={<Layers size={12}/>} 
                            value={settings.adjustments.ditherAmount ?? 50} min={0} max={100} step={1}
                            onChange={(v) => handleAdjustmentChange({ ditherAmount: v })}
                            titles={sliderTitles}
                            suffix="%"
                            disabled={!ERROR_DIFFUSION_METHODS.includes(settings.ditherMethod)}
                          />
                          <Slider 
                            label={t.noiseLevel} icon={<Zap size={12}/>} 
                            value={settings.adjustments.noiseLevel ?? 50} min={0} max={100} step={1}
                            onChange={(v) => handleAdjustmentChange({ noiseLevel: v })}
                            titles={sliderTitles}
                            suffix="%"
                          />
                          <Slider 
                            label={t.solidSnap} icon={<Contrast size={12}/>} 
                            value={settings.adjustments.solidSnap ?? 50} min={0} max={100} step={1}
                            onChange={(v) => handleAdjustmentChange({ solidSnap: v })}
                            titles={sliderTitles}
                          />
                        </ControlGroup>
                     </div>

                     {(settings.ditherMethod === 'pattern-tvc' || settings.ditherMethod === 'pattern-tvc-diffusion' || settings.ditherMethod === 'yliluoma') && (
                       <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                         <ControlGroup
                           title={settings.ditherMethod === 'yliluoma' ? (t.colorBlocklist || "Color Blocklist (Yliluoma)") : (t.patternPairMatrix || "Pair Blocklist (Pattern TVC)")}
                           icon={<PaletteIcon size={14} className="text-purple-500" />}
                           collapsed={pairPanelCollapsed}
                           onToggle={() => setPairPanelCollapsed(!pairPanelCollapsed)}
                           extra={(settings.disabledPatternPairs?.length ?? 0) > 0 ? (
                             <button
                               onClick={(e) => { e.stopPropagation(); handleSettingChange({ disabledPatternPairs: [] }); }}
                               className="text-[10px] text-slate-400 hover:text-white underline"
                             >
                               {t.reset}
                             </button>
                           ) : undefined}
                           contentClassName="space-y-2"
                         >
                           {settings.ditherMethod === 'yliluoma' ? (
                             <>
                               <p className="text-[10px] text-slate-500 leading-snug">{t.colorBlocklistHint || "Click a color to exclude/restore it entirely from Yliluoma's color mixing."}</p>
                               <div className="flex flex-wrap gap-1.5">
                                 {FIXED_PALETTE.map((hex, idx) => {
                                   const isColorDisabled = (settings.disabledPatternPairs ?? []).includes(pairKey(hex, hex));
                                   const name = t.colorNames ? t.colorNames[idx] : hex;
                                   return (
                                     <button
                                       key={idx}
                                       onClick={() => handleToggleColorPattern(hex)}
                                       title={name}
                                       className={`w-6 h-6 rounded border relative transition-colors ${isColorDisabled ? 'border-red-500' : 'border-slate-700 hover:border-white'}`}
                                       style={{ backgroundColor: hex }}
                                     >
                                       {isColorDisabled && (
                                         <span className="absolute inset-0 flex items-center justify-center text-red-500 text-xs font-bold leading-none [text-shadow:0_0_2px_black]">
                                           ×
                                         </span>
                                       )}
                                     </button>
                                   );
                                 })}
                               </div>
                             </>
                           ) : (
                             <>
                               <p className="text-[10px] text-slate-500 leading-snug">{t.patternPairMatrixHint}</p>
                               <div className="overflow-x-auto">
                                 <div
                                   className="inline-grid gap-[2px]"
                                   style={{ gridTemplateColumns: `repeat(${FIXED_PALETTE.length}, 22px)` }}
                                 >
                                   {FIXED_PALETTE.flatMap((rowColor, rowIdx) =>
                                     FIXED_PALETTE.map((colColor, colIdx) => {
                                       if (colIdx < rowIdx) {
                                         // Lower triangle left blank - each pair only shown once
                                         return <div key={`${rowIdx}-${colIdx}`} className="w-[22px] h-[22px]" />;
                                       }
                                       const rowName = t.colorNames ? t.colorNames[rowIdx] : rowColor;
                                       if (colIdx === rowIdx) {
                                         // Solid cell - clicking excludes/restores this
                                         // color entirely (every pair involving it).
                                         const isColorDisabled = (settings.disabledPatternPairs ?? []).includes(pairKey(rowColor, rowColor));
                                         return (
                                           <button
                                             key={`${rowIdx}-${colIdx}`}
                                             onClick={() => handleToggleColorPattern(rowColor)}
                                             className={`w-[22px] h-[22px] rounded-[2px] border relative transition-colors ${isColorDisabled ? 'border-red-500' : 'border-slate-700 hover:border-white'}`}
                                             style={{ backgroundColor: rowColor }}
                                             title={rowName}
                                           >
                                             {isColorDisabled && (
                                               <span className="absolute inset-0 flex items-center justify-center text-red-500 text-[11px] font-bold leading-none [text-shadow:0_0_2px_black]">
                                                 ×
                                               </span>
                                             )}
                                           </button>
                                         );
                                       }
                                       const colName = t.colorNames ? t.colorNames[colIdx] : colColor;
                                       const key = pairKey(rowColor, colColor);
                                       const isDisabled = (settings.disabledPatternPairs ?? []).includes(key);
                                       return (
                                         <button
                                           key={`${rowIdx}-${colIdx}`}
                                           onClick={() => handleTogglePatternPair(rowColor, colColor)}
                                           className={`w-[22px] h-[22px] rounded-[2px] border relative transition-colors ${isDisabled ? 'border-red-500' : 'border-slate-700 hover:border-white'}`}
                                           style={{ background: `linear-gradient(135deg, ${rowColor} 50%, ${colColor} 50%)` }}
                                           title={`${rowName} + ${colName}`}
                                         >
                                           {isDisabled && (
                                             <span className="absolute inset-0 flex items-center justify-center text-red-500 text-[11px] font-bold leading-none [text-shadow:0_0_2px_black]">
                                               ×
                                             </span>
                                           )}
                                         </button>
                                       );
                                     })
                                   )}
                                 </div>
                               </div>
                             </>
                           )}
                         </ControlGroup>
                       </div>
                     )}

                     {/* Top: Save Buttons (Void of the L) */}
                     <ExportButtons
                       t={t}
                       className="grid gap-2 shrink-0 grid-cols-1"
                       offerBothBmpRatios={settings.outputMode === 'tvc-16' && settings.resolutionMode !== 'tvc256k'}
                       isProcessing={state === ProcessingState.PROCESSING}
                       disableBinWhileProcessing
                       onDownloadBmp={downloadBMP}
                       onDownloadBin={downloadBin}
                       onDownloadZx7={downloadBinZX7}
                     />
                  </div>
              </div>
            </div>
          </div>
        )}

        {showFullRes && pixelData && (
          <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
            <div className="relative bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl flex flex-col items-center max-w-[95vw] max-h-[95vh] overflow-auto custom-scrollbar">
              <button 
                onClick={() => setShowFullRes(false)}
                className="fixed top-4 right-4 w-12 h-12 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center text-white shadow-xl transition-all z-10"
                title={t.ttClosePreview}
              >
                <X size={24} />
              </button>
              
              <div className="mb-6 text-center">
                <h3 className="text-xl font-bold mb-1">{t.nativePreview}</h3>
                <p className="text-xs text-slate-500 mono uppercase tracking-widest">
                   {isTVC256k ? "256 x 240 pixeli (1:1)" : (!isOriginalMode || !settings.saveOriginalSize) && isAnyTVC ? (t as any).nativePreviewDescTVC(settings.outputMode) : t.nativePreviewDescOriginal(pixelData.width, pixelData.height)}
                </p>
              </div>

              <div 
                className="bg-black border border-white/20 shadow-2xl relative pixelated shrink-0"
                style={{ 
                   width: ((isTVC16 && !isTVC256k) || (isOriginalMode && settings.saveOriginalSize)) ? `${pixelData.width * 2}px` : `${pixelData.width}px`, 
                   height: `${pixelData.height}px`
                }}
              >
                <img 
                  src={currentDisplayUrl} 
                  alt="Full Res" 
                  className="w-full h-full object-fill"
                />
              </div>

              <ExportButtons
                t={t}
                className="mt-8 grid gap-2 w-full max-w-md grid-cols-1"
                offerBothBmpRatios={settings.outputMode === 'tvc-16' && settings.resolutionMode !== 'tvc256k'}
                isProcessing={state === ProcessingState.PROCESSING}
                onDownloadBmp={downloadBMP}
                onDownloadBin={downloadBin}
                onDownloadZx7={downloadBinZX7}
              />
            </div>
          </div>
        )}

        {showTheaterMode && pixelData && (
          <div 
            className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-0 animate-in fade-in zoom-in duration-200 overflow-hidden cursor-zoom-out"
            onClick={() => setShowTheaterMode(false)}
            title={t.closePreview}
          >
              <button 
                className="fixed top-4 right-4 w-12 h-12 bg-slate-800/50 hover:bg-slate-700 rounded-full flex items-center justify-center text-white shadow-xl transition-all z-20 backdrop-blur-md"
                title={t.ttClosePreview}
              >
                <X size={24} />
              </button>

                  <img 
                  src={currentDisplayUrl} 
                  alt="Theater Mode" 
                  className="pixelated shadow-2xl"
                  style={{
                      maxWidth: '100vw',
                      maxHeight: '100vh',
                      width: `min(100vw, 100vh * ${(pixelData.width * (((isTVC16 && !isTVC256k) || isOriginalMode) ? 2 : 1)) / pixelData.height})`,
                      height: `min(100vh, 100vw / ${(pixelData.width * (((isTVC16 && !isTVC256k) || isOriginalMode) ? 2 : 1)) / pixelData.height})`,
                      objectFit: 'fill'
                  }}
              />
          </div>
        )}

        {error && (
          <div className="max-w-xl mx-auto mt-12 p-6 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center space-x-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0">
              <span className="text-rose-500 font-bold text-xl">!</span>
            </div>
            <div>
              <p className="text-rose-100 font-bold mb-1">{t.error}</p>
              <p className="text-rose-300 text-sm">{error}</p>
              <Button onClick={reset} variant="ghost" className="mt-3 text-rose-400 p-0 text-xs" title={t.ttNew}>{t.reset}</Button>
            </div>
          </div>
        )}

        {showManual && <ManualModal t={t} lang={lang} onClose={() => setShowManual(false)} />}
      </main>

      <AppFooter t={t} />

      {showDitherGrid && sourceImage && (
        <DitherGrid
          t={t}
          img={sourceImage}
          settings={settings}
          aspect={isOriginalMode ? 1 : visualAspect}
          onPick={(m) => handleSettingChange({ ditherMethod: m })}
          onClose={() => setShowDitherGrid(false)}
        />
      )}
      {isAutoTuning && <AutoTuneModal t={t} progress={autoTuneProgress} onCancel={cancelAutoTune} />}
    </div>
  );
};

export default App;
