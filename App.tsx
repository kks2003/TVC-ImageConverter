import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, Layers, Image as ImageIcon, Monitor, Sun, Contrast, Zap, Palette as PaletteIcon, Move, RotateCcw, ArrowLeftRight, Maximize, X, Eye, EyeOff, Languages, FileCode, Wand2, Plus, Minus, Expand, ChevronDown, ChevronUp, Facebook, HelpCircle, Info, Sparkles, Filter, Copy, Crop, Pencil } from 'lucide-react';
import Markdown from 'react-markdown';
import Button from './components/Button';
import { ProcessingState, ProcessingSettings, PixelData, DitherMethod, ImageAdjustments } from './types';
import { processImage, trimSolidBorder, generateTransparencyMask, createMaskedPreviewUrl, pairKey } from './services/imageProcessor';
import { encodeBMP, encodeBMP4bpp, encodeEditorBin, TVC_PALETTE_MAP_256K, TVCEditorMode, DEFAULT_ACTIVE_COLORS } from './services/bmpEncoder';
import PixelEditor from './PixelEditor';
import { compressZX7 } from './services/zx7';
import { findBestSettings, findBestColors } from './services/autoTuner';
import huManual from './USER_MANUAL_HU.md?raw';
import enManual from './USER_MANUAL_EN.md?raw';

// Strict 15-color palette as requested
const FIXED_PALETTE = [
  "#000000", "#000092", "#920000", "#920092", 
  "#0000FF", "#FF0000", "#FF00FF", "#009200", 
  "#009292", "#929200", "#929292", "#00FF00", 
  "#00FFFF", "#FFFF00", "#FFFFFF"
];

const TVC_MODES = {
  MODE_16: 'tvc-16' as const,
  MODE_4: 'tvc-4' as const,
  MODE_2: 'tvc-2' as const,
};

// Dither methods where the "Error Diffusion Amount" slider actually has an
// effect (see services/imageProcessor.ts - only the true error-diffusion
// family propagates quantization error, scaled by ditherAmount). Ordered,
// pattern-tvc, threshold and "none" ignore that setting entirely.
const ERROR_DIFFUSION_METHODS: DitherMethod[] = [
  'floyd-steinberg', 'atkinson', 'sierra-lite', 'stucki', 'burkes', 'jarvis', 'pattern-tvc-diffusion', 'ostromoukhov'
];

// Mapping from FIXED_PALETTE index to TVC Hardware Color Code (IGRB)
// 0: fekete -> 0000 (1. fekete mint tényleges rajzolószín; a 9. fekete / 1000 átlátszóságra van fenntartva)
const TVC_PALETTE_MAP = [
  0,  // 0: Black (#000000) -> 0000 (1. fekete)
  1,  // 1: Dark Blue (#000092) -> 0001
  2,  // 2: Dark Red (#920000) -> 0010
  3,  // 3: Dark Purple (#920092) -> 0011
  9,  // 4: Bright Blue (#0000FF) -> 1001
  10, // 5: Bright Red (#FF0000) -> 1010
  11, // 6: Bright Purple (#FF00FF) -> 1011
  4,  // 7: Dark Green (#009200) -> 0100
  5,  // 8: Dark Cyan (#009292) -> 0101
  6,  // 9: Dark Yellow (#929200) -> 0110
  7,  // 10: Grey (#929292) -> 0111
  12, // 11: Bright Green (#00FF00) -> 1100
  13, // 12: Bright Cyan (#00FFFF) -> 1101
  14, // 13: Bright Yellow (#FFFF00) -> 1110
  15  // 14: White (#FFFFFF) -> 1111
];

const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 100,
  gamma: 1.0,
  ditherAmount: 50,
  noiseLevel: 50,
  solidSnap: 50,
  denoise: 0,
  unsharpMask: 0,
  toneMapping: 0
};

const ControlGroup: React.FC<{ 
  title: string, 
  icon: React.ReactNode, 
  children: React.ReactNode, 
  extra?: React.ReactNode,
  collapsed?: boolean,
  onToggle?: () => void,
  contentClassName?: string,
  className?: string
}> = ({ title, icon, children, extra, collapsed, onToggle, contentClassName, className }) => (
  <div className={className || "space-y-4"}>
    <div 
      className={`flex items-center justify-between border-b border-slate-800 pb-2 ${onToggle ? 'cursor-pointer hover:bg-slate-800/50 rounded px-1 transition-colors' : ''}`}
      onClick={onToggle}
    >
      <div className="flex items-center space-x-2 text-slate-100">
        {icon}
        <h4 className="text-xs font-bold uppercase tracking-wider">{title}</h4>
      </div>
      <div className="flex items-center gap-2">
        {extra}
        {onToggle && (
          <div className="text-slate-500">
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </div>
        )}
      </div>
    </div>
    {!collapsed && (
      <div className={`px-1 animate-in slide-in-from-top-2 duration-200 ${contentClassName || 'space-y-4'}`}>
        {children}
      </div>
    )}
  </div>
);

const Slider: React.FC<{ 
  label: string, value: number, min: number, max: number, step: number, 
  onChange: (val: number) => void, icon?: React.ReactNode, disabled?: boolean,
  suffix?: string,
  titles?: { increase: string, decrease: string }
}> = ({ label, value, min, max, step, onChange, icon, disabled, suffix, titles }) => {
  const precision = step.toString().split('.')[1]?.length || 0;
  const { increase, decrease } = titles || { increase: 'Increase', decrease: 'Decrease' };

  const updateValue = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    onChange(parseFloat(next.toFixed(precision)));
  };

  const displayValue = label.includes('Zoom') || label.includes('Nagyítás') || label.includes('Nagyít') || label.includes('Nagyt')
    ? `${(value * 100).toFixed(0)}%` 
    : (suffix ? `${value.toFixed(0)}${suffix}` : value);

  return (
    <div className={`grid grid-cols-[82px_1fr_72px] gap-2 items-center py-0.5 ${disabled ? 'opacity-30 pointer-events-none' : ''}`}>
      <div className="flex items-center space-x-1 shrink-0 text-[10px] min-w-0">
        <span className="text-slate-400 shrink-0">{icon}</span>
        <span className="text-slate-300 truncate select-none" title={label}>{label}</span>
      </div>
      
      <input 
        type="range" 
        min={min} max={max} step={step} 
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all disabled:cursor-not-allowed min-w-0"
      />
      
      <div className="flex items-center justify-end space-x-0.5 shrink-0">
        <button 
          onClick={() => updateValue(-step)}
          className="w-[18px] h-[18px] flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex-shrink-0"
          title={decrease}
        >
          <Minus size={8} />
        </button>
        <span className="mono text-blue-400 font-bold text-[9px] w-7 text-center bg-slate-900/85 py-0.5 rounded border border-slate-800/80 shrink-0 tabular-nums">
          {displayValue}
        </span>
        <button 
          onClick={() => updateValue(step)}
          className="w-[18px] h-[18px] flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex-shrink-0"
          title={increase}
        >
          <Plus size={8} />
        </button>
      </div>
    </div>
  );
};

export interface Translation {
  title: string;
  new: string;
  introTitle: string;
  introDesc: string;
  selectImage: string;
  autoConversion: string;
  outputRes: string;
  tvcMode?: string;
  tvc16Mode: string;
  tvc4Mode: string;
  tvc2Mode: string;
  originalMode: string;
  fullScreenMode: string;
  ditherMethod: string;
  catModernist: string;
  catOrdered: string;
  catDiffusion: string;
  patternTVC: string;
  patternTVCDiffusion: string;
  blueNoise: string;
  blueNoise16?: string;
  blueNoise16Aniso?: string;
  patternMixScanline?: string;
  ttPatternMixScanline?: string;
  ordered8: string;
  ordered4: string;
  ordered2: string;
  bayer16: string;
  sierraLite: string;
  stucki: string;
  burkes: string;
  jarvis: string;
  ostromoukhov?: string;
  clusterDot: string;
  threshold: string;
  none: string;
  composition: string;
  cropFill: string;
  letterbox: string;
  stretchFill: string;
  zoom: string;
  hPos: string;
  vPos: string;
  bgFill: string;
  adjustments: string;
  reset: string;
  autoTune: string;
  autoTuneFidelity?: string;
  autoTuningTitle: string;
  autoTuningDesc: string;
  cancelAutoTune: string;
  brightness: string;
  contrast: string;
  saturation: string;
  gamma: string;
  ditherTuning: string;
  ditherAmount: string;
  noiseLevel: string;
  solidSnap: string;
  patternPairMatrix?: string;
  patternPairMatrixHint?: string;
  colorBlocklist?: string;
  colorBlocklistHint?: string;
  exportSettingsFilenamePrompt?: string;
  exportSettingsHint?: string;
  importSettingsHint?: string;
  importSettingsError?: string;
  editorBack?: string;
  editorPencil?: string;
  editorLine?: string;
  editorRectangle?: string;
  editorRectangleFilled?: string;
  editorEllipse?: string;
  editorFill?: string;
  editorThickness?: string;
  editorColors?: string;
  editorPrimaryColor?: string;
  editorSecondaryColor?: string;
  editorTransparent?: string;
  editorGrid?: string;
  editorPreview?: string;
  editorSave?: string;
  editorSaveBin?: string;
  editorSaveBinZx7?: string;
  editorOpen?: string;
  editorOpenHint?: string;
  editorPanHint?: string;
  editorSizeMismatch?: string;
  editorEditButton?: string;
  editorOpenBlank16?: string;
  editorOpenBlank4?: string;
  editorOpenBlank2?: string;
  editorOpenBlank256k?: string;
  editorUnsavedWarning?: string;
  editorCancel?: string;
  editorDiscardAndBack?: string;
  editorResetWarning?: string;
  editorResetConfirm?: string;
  editorTransparencyToggle?: string;
  editorCheckerFill?: string;
  editorSelect?: string;
  editorSelectConfirm?: string;
  editorSelectCancel?: string;
  editorFlipH?: string;
  editorFlipV?: string;
  editorScrollUp?: string;
  editorScrollDown?: string;
  editorScrollLeft?: string;
  editorScrollRight?: string;
  editorRecolorSlot?: string;
  editorRecolorHint?: string;
  editorUnrecognizedFile?: string;
  editorOpenError?: string;
  editorBinSizeMismatchTitle?: string;
  editorBinSizeMismatchHint?: string;
  editorLoad?: string;
  sourcePreview: string;
  tvcModeLabel: string;
  originalModeLabel: string;
  viewScale: string;
  viewFullscreen: string;
  noData: string;
  dragHelper: string;
  downloadBmp: string;
  downloadBin: string;
  downloadBinZX7: string;
  saveSettings: string;
  loadSettings: string;
  nativePreview: string;
  nativePreviewDescTVC: (mode: string) => string;
  nativePreviewDescOriginal: (w: number, h: number) => string;
  closePreview: string;
  error: string;
  footerMode: string;
  footerPalette: string;
  lab: string;
  increase: string;
  decrease: string;
  centerImage: string;
  autoDetect: string;
  panZoom: string;
  headerTitle: string;
  facebookGroup: string;
  ttNew: string;
  ttSelectImage: string;
  tt16Colors: string;
  tt4Colors: string;
  tt2Colors: string;
  ttOriginalMode: string;
  ttFullScreenMode: string;
  ttCropFill: string;
  ttLetterbox: string;
  ttStretchFill: string;
  ttViewFullscreen: string;
  ttViewScale: string;
  ttSelectColor: string;
  ttClosePreview: string;
  ttCancelAutoTune: string;
  ttCenterImage: string;
  ttAutoDetect: string;
  ttAutoTuneFidelity?: string;
  ttAutoTuneFlat?: string;
  ttAutoTunePrecision?: string;
  ttReset: string;
  ttCopyFrom: (mode: string) => string;
  ttDownloadBmp: string;
  ttDownloadBmp11?: string;
  ttDownloadBmp21?: string;
  ttDownloadBin: string;
  ttDownloadBinZX7: string;
  ttInvertColors: string;
  ttLanguage: string;
  ttManual: string;
  autoCropBorder?: string;
  ttAutoCropBorder?: string;
  trimBorderBtn?: string;
  ttTrimBorderBtn?: string;
  saveOriginalSize?: string;
  saveComposition?: string;
  ttSaveOriginalSize?: string;
  ttSaveOriginalSizeBtn?: string;
  ttSaveCompositionBtn?: string;
  selectedColors?: string;
  invertColors?: string;
  denoise?: string;
  unsharpMask?: string;
  toneMapping?: string;
  advancedSettings?: string;
  serpentine?: string;
  perceptualWeighting?: string;
  pixelArtCleaning?: string;
  resizeQuality?: string;
  ttResizeQuality?: string;
  autoColorSelection?: string;
  preciseAutoColor?: string;
  ttPreciseAutoColor?: string;
  ttDenoise?: string;
  ttUnsharpMask?: string;
  ttToneMapping?: string;
  ttSerpentine?: string;
  ttPerceptualWeighting?: string;
  ttPixelArtCleaning?: string;
  ttAutoColorSelection?: string;
  ttDelete?: string;
  generateMask?: string;
  ttGenerateMask?: string;
  clearMask?: string;
  ttClearMask?: string;
  maskVisibility?: string;
  ttMaskVisibility?: string;
  maskActiveBadge?: string;
  colorNames?: string[];
}

const translations: Record<Language, Translation> = {
  hu: {
    title: "Videoton TV Computer (TVC) képkészítő",
    new: "Új kép",
    introTitle: "Videoton TV Computer (TVC)<br/>Képkészítő",
    introDesc: "Konvertálj bármilyen képet a klasszikus 16, 4 vagy 2 színű módba. Anamorfikus pixel leképezés az autentikus hardveres megjelenítéshez.",
    selectImage: "Válassz képet vagy húzd ide",
    autoConversion: "Automatikus színkonverzió",
    outputRes: "Kimeneti felbontás",
    tvc16Mode: "16 Szín",
    tvc4Mode: "4 Szín",
    tvc2Mode: "2 Szín",
    originalMode: "Eredeti méret",
    fullScreenMode: "Teljes TVC képernyő",
    ditherMethod: "Dither mód", 
    catModernist: "Modernist",
    catOrdered: "Ordered (Classic)",
    catDiffusion: "Diffusion",
    patternTVC: "Pattern TVC",
    patternTVCDiffusion: "Pattern TVC (Diffusion)",
    blueNoise: "Blue Noise (Softest)",
    blueNoise16: "Blue Noise 16x16 (kevésbé ismétlődő)",
    blueNoise16Aniso: "Blue Noise 16x16 (2:1-re optimalizált)",
    patternMixScanline: "Sorminta keverés",
    ttPatternMixScanline: "A Pattern TVC váltakozó sorokban keveri a két színt sakktábla helyett. A 16 színű mód 2:1-es pixelein ez gyakran simábban olvad össze.",
    ordered8: "Ordered 8x8",
    ordered4: "Ordered 4x4",
    ordered2: "Ordered 2x2",
    bayer16: "Ordered 16x16 (Bayer)",
    sierraLite: "Sierra Lite",
    stucki: "Stucki",
    burkes: "Burkes",
    jarvis: "Jarvis, Judice, Ninke",
    ostromoukhov: "Ostromoukhov (Adaptív)",
    clusterDot: "Cluster Dot 8x8 (Halftone)",
    threshold: "Threshold (No pattern)",
    none: "None (Posterize)",
    composition: "Kompozíció",
    cropFill: "Kitöltés vágással",
    letterbox: "Teljes kép",
    stretchFill: "Nyújtás",
    zoom: "Nagyítás",
    hPos: "Vízszintes pozíció",
    vPos: "Függőleges pozíció",
    bgFill: "Háttérszín",
    adjustments: "Képbeállítások",
    reset: "Visszaállít",
    autoTune: "Automata",
    autoTuningTitle: "Automata beállítás...",
    autoTuningDesc: "Több mint 700 kombináció tesztelése a legoptimálisabb beállítások megtalálásához.",
    cancelAutoTune: "Megszakítás",
    brightness: "Fényerő",
    contrast: "Kontraszt",
    saturation: "Telítettség",
    gamma: "Gamma",
    ditherTuning: "Dither Finomhangolás",
    patternPairMatrix: "Pár-letiltás (Pattern TVC)",
    colorBlocklist: "Szín-letiltás (Yliluoma)",
    colorBlocklistHint: "Kattints egy színre, hogy teljesen kizárd/visszaengedd a Yliluoma színkeveréséből.",
    exportSettingsFilenamePrompt: "Fájlnév:",
    exportSettingsHint: "Beállítások mentése szöveges fájlba (.tvcset), tetszőleges névvel",
    importSettingsHint: "Beállítások betöltése .tvcset szöveges fájlból",
    importSettingsError: "Nem sikerült beolvasni ezt a beállítás-fájlt - lehet, hogy sérült vagy nem érvényes export.",
    patternPairMatrixHint: "Kattints egy cellára a két szín sakktábla-keverésének le-/engedélyezéséhez. A főátlós (egyszínű) cellára kattintva az adott színt teljesen kizárhatod az összes párból.",
    editorBack: "Vissza a konverterhez",
    editorPencil: "Ceruza",
    editorLine: "Vonal",
    editorRectangle: "Téglalap",
    editorRectangleFilled: "Kitöltött téglalap",
    editorEllipse: "Ellipszis",
    editorFill: "Kitöltés (vödör)",
    editorThickness: "Vastagság",
    editorColors: "Színek",
    editorPrimaryColor: "Elsődleges szín (bal klikk)",
    editorSecondaryColor: "Másodlagos szín (jobb klikk)",
    editorTransparent: "Átlátszó (16. szín)",
    editorGrid: "Pixelrács",
    editorPreview: "Előnézet",
    editorSave: "Mentés",
    editorSaveBin: "BIN",
    editorSaveBinZx7: "BIN (ZX7 tömörített)",
    editorOpen: "Megnyitás",
    editorOpenHint: "BMP, BIN vagy BIN.ZX7 fájl megnyitása, konvertálás nélkül",
    editorPanHint: "Görgővel nagyítás. Középső gomb húzása (vagy a görgetősávok) mozgatáshoz. Bal klikk = elsődleges szín, jobb klikk = másodlagos szín.",
    editorSizeMismatch: "A képnek pontosan a cél felbontásúnak kell lennie.",
    editorEditButton: "Pixel szerkesztő",
    editorOpenBlank16: "Üres 16 színű szerkesztő (128×240)",
    editorOpenBlank4: "Üres 4 színű szerkesztő (256×240)",
    editorOpenBlank2: "Üres 2 színű szerkesztő (512×240)",
    editorOpenBlank256k: "Üres 256k szerkesztő (256×240)",
    editorUnsavedWarning: "Mentetlen módosításaid vannak, amik elvesznek, ha mentés nélkül lépsz vissza.",
    editorCancel: "Mégse",
    editorDiscardAndBack: "Elvetés és vissza",
    editorResetWarning: "Ez visszaállítja a képet arra az állapotra, amilyen a megnyitáskor volt, elvetve minden módosítást. Ez visszavonható (Ctrl+Z).",
    editorResetConfirm: "Visszaállítás",
    editorTransparencyToggle: "Átlátszó szín kijelzésének mutatása/elrejtése a képen",
    editorRecolorSlot: "Szín cseréje",
    editorCheckerFill: "Pepita kitöltés: az elsődleges és másodlagos szín kockás mintájával rajzol",
    editorSelect: "Kijelölés / képrészlet áthelyezése",
    editorSelectConfirm: "Elhelyezés itt (Enter)",
    editorSelectCancel: "Mozgatás megszakítása (Esc)",
    editorFlipH: "Vízszintes tükrözés",
    editorFlipV: "Függőleges tükrözés",
    editorScrollUp: "Görgetés felfelé (körbeér)",
    editorScrollDown: "Görgetés lefelé (körbeér)",
    editorScrollLeft: "Görgetés balra (körbeér)",
    editorScrollRight: "Görgetés jobbra (körbeér)",
    editorRecolorHint: "Válassz új színt ehhez a helyhez:",
    editorUnrecognizedFile: "Ismeretlen vagy nem támogatott BMP fájl - csak az app saját exportjai nyithatók meg (128×240/256×240/512×240, 24bpp, vagy 256×240 4bpp).",
    editorOpenError: "Nem sikerült beolvasni a fájlt.",
    editorBinSizeMismatchTitle: "A fájl mérete nem egyezik pontosan egyik ismert felbontással sem.",
    editorBinSizeMismatchHint: "Fájlméret: {size} bájt. Válaszd ki, melyik felbontásként értelmezze (a legjobb tipp előre kiválasztva):",
    editorLoad: "Betöltés",
    ditherAmount: "Hibaterjesztés mértéke",
    noiseLevel: "Zajszint",
    solidSnap: "Tiszta felületek védelme",
    sourcePreview: "FORRÁS ELŐNÉZET",
    tvcModeLabel: "TVC MÓD (2:1 NYÚJTÁS)",
    originalModeLabel: "EREDETI MÓD (2:1 NYÚJTÁS)",
    viewScale: "1:1 Nézet",
    viewFullscreen: "Teljes képernyős nézet",
    noData: "Nincs adat",
    dragHelper: "Húzd a pozicionáláshoz • Görgess a nagyításhoz",
    downloadBmp: "Mentés BMP-ként",
    downloadBin: "Mentés TVC bin-ként",
    downloadBinZX7: "Mentés TVC bin-ként (ZX7)",
    saveSettings: "Beállítások mentése",
    loadSettings: "Beállítások betöltése",
    nativePreview: "Valós méretű előnézet",
    nativePreviewDescTVC: (mode: string) => mode === 'tvc-2' ? "512 x 240 pixel (1:1 megjelenítés)" : mode === 'tvc-4' ? "256 x 240 pixel (1:1 megjelenítés)" : "128 x 240 pixel (Nyújtva 256 x 240-re)",
    nativePreviewDescOriginal: (w: number, h: number) => `${w} x ${h} pixel (Nyújtva ${w*2} x ${h}-re)`,
    closePreview: "Bezárás",
    error: "Hiba",
    footerMode: "TVC MÓD: 128x240 (WIDE PIXELS)",
    footerPalette: "HARDWARE PALETTE: 15 COLORS",
    lab: "Videoton TV Computert (TVC) image maker // Lab",
    increase: "Növelés",
    decrease: "Csökkentés",
    centerImage: "Középre",
    autoDetect: "Legjobb beállítások automatikus észlelése",
    panZoom: "Húzd a mozgatáshoz • Görgess a nagyításhoz",
    headerTitle: "VIDEOTON TV COMPUTER kép konverter",
    facebookGroup: "Facebook csoport",
    ttNew: "Új kép betöltése",
    ttSelectImage: "Kép kiválasztása a számítógépről",
    tt16Colors: "16 színű mód (128x240 felbontás)",
    tt4Colors: "4 színű mód (256x240 felbontás)",
    tt2Colors: "2 színű mód (512x240 felbontás)",
    ttOriginalMode: "Megtartja a kép eredeti felbontását.",
    ttFullScreenMode: "Hozzáigazítja a kép méretét a TVC képernyőjéhez.",
    ttCropFill: "Kép kitöltése levágással",
    ttLetterbox: "Kép teljes megjelenítése (fekete sávokkal)",
    ttStretchFill: "Kép nyújtása a teljes területre",
    ttViewFullscreen: "Teljes képernyős nézet",
    ttViewScale: "Eredeti méretű nézet",
    ttSelectColor: "Szín kiválasztása",
    ttClosePreview: "Előnézet bezárása",
    ttCancelAutoTune: "Automatikus észlelés megszakítása",
    ttCenterImage: "Kép középre igazítása",
    ttAutoDetect: "Automata 1 (TVC Stílus): Autentikus retro TVC képi megjelenés",
    ttAutoTuneFidelity: "Automata 2 (Hűség): A beállított kompozícióra/kivágásra koncentrálva a legkisebb eltérés keresése az eredeti képre",
    ttAutoTuneFlat: "Automata 3 (Tiszta Pixel Art): Sík színfelületek, dithering-zaj nélkül - kézzel pixelezett hatás",
    ttAutoTunePrecision: "Automata 4 (Precizitás): Valódi strukturális hasonlóság (SSIM) alapú pontszámozás, kézzel belőtt szorzók helyett",
    ttReset: "Képbeállítások visszaállítása alapértelmezettre",
    ttCopyFrom: (mode: string) => `Beállítások másolása innen: ${mode}`,
    ttDownloadBmp: "Kép mentése szabványos BMP formátumban",
    ttDownloadBmp11: "Kép mentése 1:1 képarányú BMP-ként (128x240)",
    ttDownloadBmp21: "Kép mentése 2:1 képarányú BMP-ként (256x240)",
    ttDownloadBin: "Kép mentése nyers TVC bináris formátumban",
    ttDownloadBinZX7: "Kép mentése ZX7 tömörített TVC bináris formátumban",
    ttInvertColors: "A két kiválasztott szín felcserélése",
    ttLanguage: "Nyelv megváltoztatása",
    ttManual: "Felhasználói kézikönyv",
    autoCropBorder: "Keret automatikus levágása",
    ttAutoCropBorder: "A betöltött kép körüli egyszínű keret (bal felső pixel alapján) automatikus eltávolítása",
    trimBorderBtn: "Keret",
    ttTrimBorderBtn: "Körülötte lévő egyszínű keret eltávolítása a bal felső pixel alapján",
    saveOriginalSize: "Eredeti méretben mentés",
    saveComposition: "Kompozíció mentése (TVC felbontás)",
    ttSaveOriginalSize: "Válaszd ki, hogy a mentés az eredeti kép méretében történjen, vagy a beállított kompozíció szerint a TVC felbontásában.",
    ttSaveOriginalSizeBtn: "A teljes kép mentése az eredeti felbontásában, TVC palettával.",
    ttSaveCompositionBtn: "A beállított kivágás (zoom/pan) mentése fix TVC felbontásban.",
    selectedColors: "Kiválasztott színek",
    invertColors: "Színek felcserélése",
    denoise: "Elő-zajszűrés",
    unsharpMask: "Élkiemelés",
    toneMapping: "Dinamika-tömörítés",
    advancedSettings: "Haladó beállítások",
    serpentine: "Szerpentin",
    perceptualWeighting: "Látás alapú",
    pixelArtCleaning: "Pötty-szűrés",
    resizeQuality: "Sima kicsinyítés",
    ttResizeQuality: "Gamma-korrekt, terület-átlagoló kicsinyítés (tisztább fotóknál, de lassabb). Kikapcsolva: az eredeti, gyors nearest-neighbor kicsinyítés.",
    autoColorSelection: "Auto Szín",
    preciseAutoColor: "Precíz Auto Szín (Lab)",
    ttPreciseAutoColor: "CIELAB (perceptuálisan egyenletes) színtávolságot használ a szokásos redmean-közelítés helyett a legjobb színek kiválasztásakor. Csak ezt az egyszeri színválasztást érinti, nem a pixelenkénti ditherelést - nyugodtan bekapcsolva hagyható.",
    ttDenoise: "Csökkenti a digitális zajt a kicsinyítés előtt.",
    ttUnsharpMask: "Kiemeli az éleket a fontos részletek megőrzéséhez.",
    ttToneMapping: "Tömöríti a dinamikatartományt a részletek megőrzéséhez sötét/világos részeken.",
    ttSerpentine: "Szerpentin szkennelés: A dithering irányát soronként váltogatja, így kevésbé látszanak a mintázatok.",
    ttPerceptualWeighting: "Perceptuális színmérés: Az emberi szem érzékenységét veszi figyelembe a színek távolságának számításakor.",
    ttPixelArtCleaning: "Pixel art tisztítás: Eltávolítja az elszigetelt pixeleket, hogy a kép tisztább legyen.",
    ttAutoColorSelection: "Automata színválasztás (K-Means): Automatikusan kiválasztja a legjobb színeket a palettából 4 és 2 színű módban.",
    ttDelete: "Törlés",
    generateMask: "Maszk",
    ttGenerateMask: "A képet körülvevő külső egyszínű háttér átlátszóvá tétele (9. fekete / 1000 kód)",
    clearMask: "Törlés",
    ttClearMask: "Átlátszó háttérmaszk törlése",
    maskVisibility: "Átlátszóság",
    ttMaskVisibility: "Átlátszó háttér vizuális megjelenítésének ki/bekapcsolása a képernyőn",
    maskActiveBadge: "Átlátszó maszk aktív",
    colorNames: [
      "Fekete", "Sötétkék", "Sötétpiros", "Sötétlila", 
      "Kék", "Piros", "Lila", "Sötétzöld", 
      "Sötétcián", "Sötétsárga", "Szürke", "Zöld", 
      "Cián", "Sárga", "Fehér"
    ]
  },
  en: {
    title: "Videoton TV Computert (TVC) image maker",
    new: "New",
    introTitle: "Videoton TV Computert (TVC)<br/>Image Maker",
    introDesc: "Convert any image to the classic 16, 4, or 2 color modes. Anamorphic pixel mapping for authentic hardware display.",
    selectImage: "Select Image or Drag & Drop",
    autoConversion: "Automatic color conversion",
    outputRes: "Output Resolution",
    tvc16Mode: "16 Colors",
    tvc4Mode: "4 Colors",
    tvc2Mode: "2 Colors",
    originalMode: "Original Size",
    fullScreenMode: "Full TVC Screen",
    ditherMethod: "Dithering Method",
    catModernist: "Modernist",
    catOrdered: "Ordered (Classic)",
    catDiffusion: "Diffusion",
    patternTVC: "Pattern TVC",
    patternTVCDiffusion: "Pattern TVC (Diffusion)",
    blueNoise: "Blue Noise (Softest)",
    blueNoise16: "Blue Noise 16x16 (less repetitive)",
    blueNoise16Aniso: "Blue Noise 16x16 (2:1 optimized)",
    patternMixScanline: "Scanline Mix",
    ttPatternMixScanline: "Pattern TVC blends its two colors in alternating rows instead of a checkerboard. On the 16-color mode 2:1 pixels this often blends more smoothly.",
    ordered8: "Ordered 8x8",
    ordered4: "Ordered 4x4",
    ordered2: "Ordered 2x2",
    bayer16: "Ordered 16x16 (Bayer)",
    sierraLite: "Sierra Lite",
    stucki: "Stucki",
    burkes: "Burkes",
    jarvis: "Jarvis, Judice, Ninke",
    ostromoukhov: "Ostromoukhov (Adaptive)",
    clusterDot: "Cluster Dot 8x8 (Halftone)",
    threshold: "Threshold (No pattern)",
    none: "None (Posterize)",
    composition: "Composition",
    cropFill: "Crop Fill",
    letterbox: "Letterbox",
    stretchFill: "Stretch",
    zoom: "Picture Zoom",
    hPos: "Horizontal Position",
    vPos: "Vertical Position",
    bgFill: "Background Fill",
    adjustments: "Image Adjustments",
    reset: "Reset",
    autoTune: "Auto Tune",
    autoTuningTitle: "Auto-Tuning...",
    autoTuningDesc: "Testing over 700 combinations to find the optimal settings.",
    cancelAutoTune: "Cancel",
    brightness: "Brightness",
    contrast: "Contrast",
    saturation: "Saturation",
    gamma: "Gamma",
    ditherTuning: "Dither Tuning",
    patternPairMatrix: "Pair Blocklist (Pattern TVC)",
    patternPairMatrixHint: "Click a cell to allow/disallow checkerboard-mixing those two colors. Clicking a diagonal (solid) cell excludes that color from every pair entirely.",
    colorBlocklist: "Color Blocklist (Yliluoma)",
    colorBlocklistHint: "Click a color to exclude/restore it entirely from Yliluoma's color mixing.",
    exportSettingsFilenamePrompt: "File name:",
    exportSettingsHint: "Save settings to a text file (.tvcset) with a name you choose",
    importSettingsHint: "Load settings from a .tvcset text file",
    importSettingsError: "Could not read this settings file - it may be corrupted or not a valid settings export.",
    editorBack: "Back to converter",
    editorPencil: "Pencil",
    editorLine: "Line",
    editorRectangle: "Rectangle",
    editorRectangleFilled: "Filled rectangle",
    editorEllipse: "Ellipse",
    editorFill: "Fill (bucket)",
    editorThickness: "Thickness",
    editorColors: "Colors",
    editorPrimaryColor: "Primary color (left click)",
    editorSecondaryColor: "Secondary color (right click)",
    editorTransparent: "Transparent (16th color)",
    editorGrid: "Pixel grid",
    editorPreview: "Preview",
    editorSave: "Save",
    editorSaveBin: "BIN",
    editorSaveBinZx7: "BIN (ZX7 compressed)",
    editorOpen: "Open",
    editorOpenHint: "Open a BMP, BIN, or BIN.ZX7 file, without conversion",
    editorPanHint: "Scroll to zoom. Middle-click drag (or the scrollbars) to pan. Left click = primary color, right click = secondary color.",
    editorSizeMismatch: "The image must be exactly the target resolution.",
    editorEditButton: "Pixel Editor",
    editorOpenBlank16: "Open blank 16-color editor (128×240)",
    editorOpenBlank4: "Open blank 4-color editor (256×240)",
    editorOpenBlank2: "Open blank 2-color editor (512×240)",
    editorOpenBlank256k: "Open blank 256k editor (256×240)",
    editorUnsavedWarning: "You have unsaved changes that will be lost if you go back without saving.",
    editorCancel: "Cancel",
    editorDiscardAndBack: "Discard and go back",
    editorResetWarning: "This resets the image to how it was when you opened it, discarding every edit. This can be undone (Ctrl+Z).",
    editorResetConfirm: "Reset",
    editorTransparencyToggle: "Show/hide the transparent-color highlight on the canvas",
    editorRecolorSlot: "Change this color",
    editorCheckerFill: "Checkerboard fill: draw with primary + secondary in a checker pattern",
    editorSelect: "Select / move a rectangular area",
    editorSelectConfirm: "Place here (Enter)",
    editorSelectCancel: "Cancel move (Esc)",
    editorFlipH: "Flip horizontally",
    editorFlipV: "Flip vertically",
    editorScrollUp: "Scroll up (wraps around)",
    editorScrollDown: "Scroll down (wraps around)",
    editorScrollLeft: "Scroll left (wraps around)",
    editorScrollRight: "Scroll right (wraps around)",
    editorRecolorHint: "Pick a new color for this slot:",
    editorUnrecognizedFile: "Unrecognized or unsupported BMP file - only this app's own exports can be opened (128×240/256×240/512×240 24bpp, or 256×240 4bpp).",
    editorOpenError: "Could not read the file.",
    editorBinSizeMismatchTitle: "The file's size doesn't exactly match any known resolution.",
    editorBinSizeMismatchHint: "File size: {size} bytes. Pick which resolution to interpret it as (best guess pre-selected):",
    editorLoad: "Load",
    ditherAmount: "Error Diffusion Amount",
    noiseLevel: "Noise Level",
    solidSnap: "Solid Area Snap",
    sourcePreview: "SOURCE PREVIEW",
    tvcModeLabel: "TVC MODE (2:1 STRETCH)",
    originalModeLabel: "ORIGINAL MODE (2:1 STRETCH)",
    viewScale: "View 1:1 Scale",
    viewFullscreen: "Fullscreen Preview",
    noData: "No data",
    dragHelper: "Drag to position • Scroll to zoom",
    downloadBmp: "Save as BMP",
    downloadBin: "Save as TVC bin",
    downloadBinZX7: "Save as TVC bin (ZX7)",
    saveSettings: "Save Settings",
    loadSettings: "Load Settings",
    nativePreview: "Native Size Preview",
    nativePreviewDescTVC: (mode: string) => mode === 'tvc-2' ? "512 x 240 pixels (1:1 display)" : mode === 'tvc-4' ? "256 x 240 pixels (1:1 display)" : "128 x 240 pixels (Stretched to 256 x 240)",
    nativePreviewDescOriginal: (w: number, h: number) => `${w} x ${h} pixels (Stretched to ${w*2} x ${h})`,
    closePreview: "Close Preview",
    error: "Error",
    footerMode: "TVC MODE: 128x240 (WIDE PIXELS)",
    footerPalette: "HARDWARE PALETTE: 15 COLORS",
    lab: "Videoton TV Computert (TVC) image maker // Lab",
    increase: "Increase",
    decrease: "Decrease",
    centerImage: "Center",
    autoDetect: "Auto-detect best settings",
    panZoom: "Drag to Pan • Scroll to Zoom View",
    headerTitle: "VIDEOTON TV COMPUTER image converter",
    facebookGroup: "Facebook group",
    ttNew: "Load a new image",
    ttSelectImage: "Select an image from your computer",
    tt16Colors: "16-color mode (128x240 resolution)",
    tt4Colors: "4-color mode (256x240 resolution)",
    tt2Colors: "2-color mode (512x240 resolution)",
    ttOriginalMode: "Keep the original resolution of the image.",
    ttFullScreenMode: "Adjust the image size to the TVC screen.",
    ttCropFill: "Fill image with crop",
    ttLetterbox: "Show full image (with black bars)",
    ttStretchFill: "Stretch image to fill area",
    ttViewFullscreen: "View fullscreen",
    ttViewScale: "View original size",
    ttSelectColor: "Select color",
    ttClosePreview: "Close preview",
    ttCancelAutoTune: "Cancel auto-tuning",
    ttCenterImage: "Center image",
    ttAutoDetect: "Auto-detect best settings",
    ttAutoTunePrecision: "Auto 4 (Precision): Genuine structural-similarity (SSIM) based scoring, instead of hand-tuned multipliers",
    ttReset: "Reset image adjustments to default",
    ttCopyFrom: (mode: string) => `Copy settings from ${mode}`,
    ttDownloadBmp: "Save image in standard BMP format",
    ttDownloadBmp11: "Save image as 1:1 aspect ratio BMP (128x240)",
    ttDownloadBmp21: "Save image as 2:1 aspect ratio BMP (256x240)",
    ttDownloadBin: "Save image in raw TVC binary format",
    ttDownloadBinZX7: "Save image in ZX7 compressed TVC binary format",
    ttInvertColors: "Swap the two selected colors",
    ttLanguage: "Change language",
    ttManual: "User Manual",
    autoCropBorder: "Auto-crop solid border",
    ttAutoCropBorder: "Automatically crop solid border around loaded image based on top-left pixel",
    trimBorderBtn: "Trim border",
    ttTrimBorderBtn: "Remove surrounding solid border based on top-left pixel",
    saveOriginalSize: "Save in original size",
    saveComposition: "Save composition (TVC resolution)",
    ttSaveOriginalSize: "Choose whether to save in the original image size or according to the set composition in TVC resolution.",
    ttSaveOriginalSizeBtn: "Save the full image in its original resolution using the TVC palette.",
    ttSaveCompositionBtn: "Save the current composition (zoom/pan) in fixed TVC resolution.",
    selectedColors: "Selected Colors",
    invertColors: "Invert Colors",
    denoise: "Denoising",
    unsharpMask: "Unsharp Mask",
    toneMapping: "Tone Mapping",
    advancedSettings: "Advanced Settings",
    serpentine: "Serpentine",
    perceptualWeighting: "Perceptual",
    pixelArtCleaning: "Clean Noise",
    resizeQuality: "Smooth Resize",
    ttResizeQuality: "Gamma-correct area-average downscale (cleaner on photos, but slower). Off = the original fast nearest-neighbor resize.",
    autoColorSelection: "Auto Color",
    preciseAutoColor: "Precise Auto Color (Lab)",
    ttPreciseAutoColor: "Uses CIELAB (perceptually uniform) color distance instead of the usual redmean approximation when picking the best colors. Only affects this one-time color selection, not the per-pixel dithering - safe to leave on.",
    ttDenoise: "Reduces digital noise before resizing.",
    ttUnsharpMask: "Enhances edges to preserve important details.",
    ttToneMapping: "Compresses dynamic range to preserve details in dark/bright areas.",
    ttSerpentine: "Serpentine Scanning: Alternates the dithering direction per row to reduce visible patterns.",
    ttPerceptualWeighting: "Perceptual Color Distance: Takes human eye sensitivity into account when calculating color differences.",
    ttPixelArtCleaning: "Pixel Art Cleaning: Removes isolated pixels to make the image cleaner.",
    ttAutoColorSelection: "Auto Color Selection (K-Means): Automatically selects the best colors from the palette for 4 and 2 color modes.",
    ttDelete: "Delete",
    generateMask: "Mask",
    ttGenerateMask: "Make outer solid background transparent (9th black / 1000 code)",
    clearMask: "Clear",
    ttClearMask: "Remove transparency mask",
    maskVisibility: "Transparency",
    ttMaskVisibility: "Toggle visual highlight of transparent background on screen",
    maskActiveBadge: "Transparent Mask Active",
    colorNames: [
      "Black", "Dark Blue", "Dark Red", "Dark Purple", 
      "Blue", "Red", "Purple", "Dark Green", 
      "Dark Cyan", "Dark Yellow", "Grey", "Green", 
      "Cyan", "Yellow", "White"
    ]
  },
  pl: {
    title: "Generator obrazów Videoton TV Computer (TVC)",
    new: "Nowy",
    introTitle: "Generator Obrazów<br/>Videoton TV Computer (TVC)",
    introDesc: "Konwertuj dowolny obraz na klasyczny tryb 16, 4 lub 2-kolorowy. Anamorficzne mapowanie pikseli dla autentycznych wyników wyświetlania na sprzęcie.",
    selectImage: "Wybierz obraz lub przeciągnij i upuść",
    autoConversion: "Automatyczna konwersja kolorów",
    outputRes: "Rozdzielczość wyjściowa",
    tvcMode: "TVC (128x240)",
    tvc16Mode: "16 Kolorów",
    tvc4Mode: "4 Kolory",
    tvc2Mode: "2 Kolory",
    originalMode: "Oryginalny rozmiar",
    fullScreenMode: "Pełny ekran TVC",
    ditherMethod: "Metoda ditheringu",
    catModernist: "Modernist",
    catOrdered: "Ordered (Classic)",
    catDiffusion: "Diffusion",
    patternTVC: "Pattern TVC",
    patternTVCDiffusion: "Pattern TVC (Diffusion)",
    blueNoise: "Blue Noise (Softest)",
    blueNoise16: "Blue Noise 16x16 (mniej powtarzalny)",
    blueNoise16Aniso: "Blue Noise 16x16 (zoptymalizowany dla 2:1)",
    patternMixScanline: "Mieszanie liniowe",
    ttPatternMixScanline: "Pattern TVC miesza dwa kolory w naprzemiennych wierszach zamiast szachownicy. Na pikselach 2:1 trybu 16-kolorowego często daje płynniejsze przejścia.",
    ordered8: "Ordered 8x8",
    ordered4: "Ordered 4x4",
    ordered2: "Ordered 2x2",
    bayer16: "Ordered 16x16 (Bayer)",
    sierraLite: "Sierra Lite",
    stucki: "Stucki",
    burkes: "Burkes",
    jarvis: "Jarvis, Judice, Ninke",
    ostromoukhov: "Ostromoukhov (Adaptacyjny)",
    clusterDot: "Cluster Dot 8x8 (Halftone)",
    threshold: "Threshold (No pattern)",
    none: "None (Posterize)",
    composition: "Kompozycja",
    cropFill: "Wypełnienie z przycięciem",
    letterbox: "Letterbox",
    stretchFill: "Rozciągnięcie",
    zoom: "Powiększenie obrazu",
    hPos: "Pozycja pozioma",
    vPos: "Pozycja pionowa",
    bgFill: "Wypełnienie tła",
    adjustments: "Korekta obrazu",
    reset: "Resetuj",
    autoTune: "Auto Tune",
    autoTuningTitle: "Automatyczne strojenie...",
    autoTuningDesc: "Testowanie ponad 700 kombinacji w celu znalezienia optymalnych ustawień.",
    cancelAutoTune: "Anuluj",
    brightness: "Jasność",
    contrast: "Kontrast",
    saturation: "Nasycenie",
    gamma: "Gamma",
    ditherTuning: "Strojenie ditheringu",
    patternPairMatrix: "Blokada par (Pattern TVC)",
    patternPairMatrixHint: "Kliknij komórkę, aby zablokować/odblokować mieszanie tych dwóch kolorów w szachownicę. Kliknięcie komórki na przekątnej (jednolity kolor) całkowicie wyklucza ten kolor ze wszystkich par.",
    colorBlocklist: "Blokada kolorów (Yliluoma)",
    colorBlocklistHint: "Kliknij kolor, aby całkowicie wykluczyć/przywrócić go w mieszaniu kolorów Yliluomy.",
    exportSettingsFilenamePrompt: "Nazwa pliku:",
    exportSettingsHint: "Zapisz ustawienia do pliku tekstowego (.tvcset) pod wybraną nazwą",
    importSettingsHint: "Wczytaj ustawienia z pliku tekstowego .tvcset",
    importSettingsError: "Nie udało się odczytać tego pliku ustawień - może być uszkodzony lub nie jest prawidłowym eksportem.",
    editorBack: "Powrót do konwertera",
    editorPencil: "Ołówek",
    editorLine: "Linia",
    editorRectangle: "Prostokąt",
    editorRectangleFilled: "Wypełniony prostokąt",
    editorEllipse: "Elipsa",
    editorFill: "Wypełnienie (wiaderko)",
    editorThickness: "Grubość",
    editorColors: "Kolory",
    editorPrimaryColor: "Kolor podstawowy (lewy klik)",
    editorSecondaryColor: "Kolor drugorzędny (prawy klik)",
    editorTransparent: "Przezroczysty (16. kolor)",
    editorGrid: "Siatka pikseli",
    editorPreview: "Podgląd",
    editorSave: "Zapisz",
    editorSaveBin: "BIN",
    editorSaveBinZx7: "BIN (skompresowany ZX7)",
    editorOpen: "Otwórz",
    editorOpenHint: "Otwórz plik BMP, BIN lub BIN.ZX7, bez konwersji",
    editorPanHint: "Przewiń, aby powiększyć. Przeciągnij środkowym przyciskiem (lub paskami przewijania), aby przesunąć. Lewy klik = kolor podstawowy, prawy klik = kolor drugorzędny.",
    editorSizeMismatch: "Obraz musi mieć dokładnie docelową rozdzielczość.",
    editorEditButton: "Edytor pikseli",
    editorOpenBlank16: "Otwórz pusty edytor 16-kolorowy (128×240)",
    editorOpenBlank4: "Otwórz pusty edytor 4-kolorowy (256×240)",
    editorOpenBlank2: "Otwórz pusty edytor 2-kolorowy (512×240)",
    editorOpenBlank256k: "Otwórz pusty edytor 256k (256×240)",
    editorUnsavedWarning: "Masz niezapisane zmiany, które zostaną utracone, jeśli wrócisz bez zapisywania.",
    editorCancel: "Anuluj",
    editorDiscardAndBack: "Odrzuć i wróć",
    editorResetWarning: "To przywróci obraz do stanu z chwili otwarcia, odrzucając wszystkie zmiany. Można to cofnąć (Ctrl+Z).",
    editorResetConfirm: "Resetuj",
    editorTransparencyToggle: "Pokaż/ukryj podświetlenie przezroczystego koloru na obrazie",
    editorRecolorSlot: "Zmień ten kolor",
    editorCheckerFill: "Wypełnienie w szachownicę: rysuje wzorem z koloru podstawowego i drugorzędnego",
    editorSelect: "Zaznacz / przenieś obszar prostokątny",
    editorSelectConfirm: "Umieść tutaj (Enter)",
    editorSelectCancel: "Anuluj przenoszenie (Esc)",
    editorFlipH: "Odbicie poziome",
    editorFlipV: "Odbicie pionowe",
    editorScrollUp: "Przewiń w górę (zawija się)",
    editorScrollDown: "Przewiń w dół (zawija się)",
    editorScrollLeft: "Przewiń w lewo (zawija się)",
    editorScrollRight: "Przewiń w prawo (zawija się)",
    editorRecolorHint: "Wybierz nowy kolor dla tego miejsca:",
    editorUnrecognizedFile: "Nierozpoznany lub nieobsługiwany plik BMP - można otwierać tylko własne eksporty aplikacji (128×240/256×240/512×240 24bpp lub 256×240 4bpp).",
    editorOpenError: "Nie udało się odczytać pliku.",
    editorBinSizeMismatchTitle: "Rozmiar pliku nie odpowiada dokładnie żadnej znanej rozdzielczości.",
    editorBinSizeMismatchHint: "Rozmiar pliku: {size} bajtów. Wybierz, jako którą rozdzielczość go zinterpretować (najlepsza propozycja jest już wybrana):",
    editorLoad: "Wczytaj",
    ditherAmount: "Ilość dyfuzji błędu",
    noiseLevel: "Poziom hałasu",
    solidSnap: "Przyciąganie do jednolitych obszarów",
    sourcePreview: "PODGLĄD ŹRÓDŁA",
    tvcModeLabel: "TRYB TVC (ROZCIĄGNIĘCIE 2:1)",
    originalModeLabel: "TRYB ORYGINALNY (ROZCIĄGNIĘCIE 2:1)",
    viewScale: "Widok w skali 1:1",
    viewFullscreen: "Podgląd pełnoekranowy",
    noData: "Brak danych",
    dragHelper: "Przeciągnij, aby ustawić • Przewiń, aby powiększyć",
    downloadBmp: "Zapisz jako BMP",
    downloadBin: "Zapisz jako TVC bin",
    downloadBinZX7: "Zapisz jako TVC bin (ZX7)",
    saveSettings: "Zapisz ustawienia",
    loadSettings: "Wczytaj ustawienia",
    nativePreview: "Podgląd rozmiaru natywnego",
    nativePreviewDescTVC: (mode: string) => mode === 'tvc-2' ? "512 x 240 pikseli (wyświetlanie 1:1)" : mode === 'tvc-4' ? "256 x 240 pikseli (wyświetlanie 1:1)" : "128 x 240 pikseli (Rozciągnięte do 256 x 240)",
    nativePreviewDescOriginal: (w: number, h: number) => `${w} x ${h} pikseli (Rozciągnięte do ${w*2} x ${h})`,
    closePreview: "Zamknij podgląd",
    error: "Błąd",
    footerMode: "TRYB TVC: 128x240 (SZEROKIE PIKSELE)",
    footerPalette: "PALETA SPRZĘTOWA: 15 KOLORÓW",
    lab: "Generator obrazów Videoton TV Computer (TVC) // Lab",
    increase: "Zwiększ",
    decrease: "Zmniejsz",
    centerImage: "Środek",
    autoDetect: "Automatyczne wykrywanie najlepszych ustawień",
    panZoom: "Przeciągnij, aby przesuwać • Przewiń, aby powiększyć widok",
    headerTitle: "Konwerter obrazów VIDEOTON TV COMPUTER",
    facebookGroup: "Grupa na Facebooku",
    ttNew: "Wczytaj nowy obraz",
    ttSelectImage: "Wybierz obraz z komputera",
    tt16Colors: "Tryb 16-kolorowy (rozdzielczość 128x240)",
    tt4Colors: "Tryb 4-kolorowy (rozdzielczość 256x240)",
    tt2Colors: "Tryb 2-kolorowy (rozdzielczość 512x240)",
    ttOriginalMode: "Zachowaj oryginalną rozdzielczość obrazu.",
    ttFullScreenMode: "Dostosuj rozmiar obrazu do ekranu TVC.",
    ttCropFill: "Wypełnij obraz z przycięciem",
    ttLetterbox: "Pokaż pełny obraz (z czarnymi paskami)",
    ttStretchFill: "Rozciągnij obraz na cały obszar",
    ttViewFullscreen: "Wyświetl na pełnym ekranie",
    ttViewScale: "Wyświetl w oryginalnym rozmiarze",
    ttSelectColor: "Wybierz kolor",
    ttClosePreview: "Zamknij podgląd",
    ttCancelAutoTune: "Anuluj automatyczne strojenie",
    ttCenterImage: "Wyśrodkuj obraz",
    ttAutoDetect: "Automatyczne wykrywanie najlepszych ustawień",
    ttAutoTunePrecision: "Auto 4 (Precyzja): Ocena oparta na rzeczywistym podobieństwie strukturalnym (SSIM) zamiast ręcznie dobranych mnożników",
    ttReset: "Zresetuj ustawienia obrazu do domyślnych",
    ttCopyFrom: (mode: string) => `Kopiuj ustawienia z ${mode}`,
    ttDownloadBmp: "Zapisz obraz w standardowym formacie BMP",
    ttDownloadBin: "Zapisz obraz w surowym formacie binarnym TVC",
    ttDownloadBinZX7: "Zapisz obraz w skompresowanym formacie binarnym TVC (ZX7)",
    saveOriginalSize: "Zapisz oryginalny rozmiar",
    saveComposition: "Zapisz kompozycję",
    ttSaveOriginalSize: "Wybierz, czy chcesz zapisać oryginalne wymiary obrazu, czy kompozycję dostosowaną do rozdzielczości TVC.",
    ttSaveOriginalSizeBtn: "Zapisz cały obraz w oryginalnej rozdzielczości przy użyciu palety TVC.",
    ttSaveCompositionBtn: "Zapisz bieżącą kompozycję (zoom/pan) w stałej rozdzielczości TVC.",
    ttInvertColors: "Zamień dwa wybrane kolory",
    ttLanguage: "Zmień język",
    ttManual: "Instrukcja obsługi",
    autoCropBorder: "Automatyczne przycinanie ramki",
    ttAutoCropBorder: "Automatycznie przycina jednokolorową ramkę wokół wczytanego obrazu na podstawie lewego górnego piksela",
    trimBorderBtn: "Przytnij ramkę",
    ttTrimBorderBtn: "Usuń otaczającą jednokolorową ramkę na podstawie lewego górnego piksela",
    selectedColors: "Wybrane kolory",
    invertColors: "Odwróć kolory",
    denoise: "Redukcja szumów",
    unsharpMask: "Maska wyostrzająca",
    toneMapping: "Mapowanie tonów",
    advancedSettings: "Ustawienia zaawansowane",
    serpentine: "Skanowanie serpentynowe",
    perceptualWeighting: "Percepcyjna odległość kolorów",
    pixelArtCleaning: "Czyszczenie Pixel Art",
    resizeQuality: "Płynne skalowanie",
    ttResizeQuality: "Korekcja gamma z uśrednianiem obszaru przy zmniejszaniu (czystszy wynik dla zdjęć, ale wolniejszy). Wyłączone: oryginalne, szybkie skalowanie metodą najbliższego sąsiada.",
    autoColorSelection: "Automatyczny wybór kolorów (K-Means)",
    preciseAutoColor: "Precyzyjny Auto Kolor (Lab)",
    ttPreciseAutoColor: "Używa odległości kolorów CIELAB (percepcyjnie jednolitej) zamiast zwykłego przybliżenia redmean przy wyborze najlepszych kolorów. Wpływa tylko na ten jednorazowy wybór kolorów, nie na dithering pikseli - można bezpiecznie zostawić włączone.",
    ttDenoise: "Redukuje szum cyfrowy przed zmianą rozmiaru.",
    ttUnsharpMask: "Wzmacnia krawędzie, aby zachować ważne szczegóły.",
    ttToneMapping: "Kompresuje zakres dynamiki, aby zachować szczegóły w ciemnych/jasnych obszarach.",
    ttSerpentine: "Naprzemienny kierunek skanowania w celu poprawy wzorów ditheringu.",
    ttPerceptualWeighting: "Porównywanie kolorów dostosowane do wrażliwości ludzkiego oka.",
    ttPixelArtCleaning: "Usuwa pojedyncze kropki pikseli dla czystszego obrazu.",
    ttAutoColorSelection: "Algorytmu K-Means do wyboru najlepszych kolorów dla trybów 4 i 2 kolorowych.",
    generateMask: "Przezroczyste tło",
    ttGenerateMask: "Ustaw zewnętrzne jednolite tło jako przezroczyste (kod 1000)",
    clearMask: "Usuń maskę",
    ttClearMask: "Usuń maskę przezroczystości",
    maskVisibility: "Przezroczystość",
    ttMaskVisibility: "Włącz/wyłącz podświetlenie przezroczystości na ekranie",
    maskActiveBadge: "Maska aktywna",
    colorNames: [
      "Czarny", "Ciemnoniebieski", "Ciemnoczerwony", "Ciemnofioletowy", 
      "Niebieski", "Czerwony", "Fioletowy", "Ciemnozielony", 
      "Ciemnocyjanowy", "Ciemnożółty", "Szary", "Zielony", 
      "Cyjan", "Żółty", "Biały"
    ]
  },
  de: {
    title: "Videoton TV Computer (TVC) Bildgenerator",
    new: "Neu",
    introTitle: "Videoton TV Computer (TVC)<br/>Bildgenerator",
    introDesc: "Konvertieren Sie jedes Bild in den klassischen 16-, 4- oder 2-Farben-Modus. Anamorphes Pixel-Mapping für authentische Hardware-Anzeigeergebnisse.",
    selectImage: "Bild auswählen oder Drag & Drop",
    autoConversion: "Automatische Farbkonvertierung",
    outputRes: "Ausgabeauflösung",
    tvcMode: "TVC (128x240)",
    tvc16Mode: "16 Farben",
    tvc4Mode: "4 Farben",
    tvc2Mode: "2 Farben",
    originalMode: "Originalgröße",
    fullScreenMode: "TVC-Vollbild",
    ditherMethod: "Dithering-Methode",
    catModernist: "Modernist",
    catOrdered: "Ordered (Classic)",
    catDiffusion: "Diffusion",
    patternTVC: "Pattern TVC",
    patternTVCDiffusion: "Pattern TVC (Diffusion)",
    blueNoise: "Blue Noise (Softest)",
    blueNoise16: "Blue Noise 16x16 (weniger repetitiv)",
    blueNoise16Aniso: "Blue Noise 16x16 (für 2:1 optimiert)",
    patternMixScanline: "Zeilen-Mischung",
    ttPatternMixScanline: "Pattern TVC mischt die beiden Farben in abwechselnden Zeilen statt als Schachbrett. Auf den 2:1-Pixeln des 16-Farben-Modus wirkt das oft weicher.",
    ordered8: "Ordered 8x8",
    ordered4: "Ordered 4x4",
    ordered2: "Ordered 2x2",
    bayer16: "Ordered 16x16 (Bayer)",
    sierraLite: "Sierra Lite",
    stucki: "Stucki",
    burkes: "Burkes",
    jarvis: "Jarvis, Judice, Ninke",
    ostromoukhov: "Ostromoukhov (Adaptiv)",
    clusterDot: "Cluster Dot 8x8 (Halftone)",
    threshold: "Schwellenwert (Kein Muster)",
    none: "Keine (Posterize)",
    composition: "Komposition",
    cropFill: "Zuschneiden Füllen",
    letterbox: "Letterbox",
    stretchFill: "Strecken",
    zoom: "Bild-Zoom",
    hPos: "Horizontale Position",
    vPos: "Vertikale Position",
    bgFill: "Hintergrundfüllung",
    adjustments: "Bildanpassungen",
    reset: "Zurücksetzen",
    autoTune: "Auto Tune",
    autoTuningTitle: "Auto-Tuning...",
    autoTuningDesc: "Über 700 Kombinationen werden getestet, um die optimalen Einstellungen zu finden.",
    cancelAutoTune: "Abbrechen",
    brightness: "Helligkeit",
    contrast: "Kontrast",
    saturation: "Sättigung",
    gamma: "Gamma",
    ditherTuning: "Dither-Tuning",
    patternPairMatrix: "Paar-Sperrliste (Pattern TVC)",
    patternPairMatrixHint: "Klicke auf eine Zelle, um das Schachbrett-Mischen dieser beiden Farben zu sperren/erlauben. Ein Klick auf eine Diagonalzelle (Vollfarbe) schließt diese Farbe komplett aus allen Paaren aus.",
    colorBlocklist: "Farbsperrliste (Yliluoma)",
    colorBlocklistHint: "Klicke auf eine Farbe, um sie vollständig vom Yliluoma-Farbmischen auszuschließen/wieder zuzulassen.",
    exportSettingsFilenamePrompt: "Dateiname:",
    exportSettingsHint: "Einstellungen in eine Textdatei (.tvcset) mit frei wählbarem Namen speichern",
    importSettingsHint: "Einstellungen aus einer .tvcset-Textdatei laden",
    importSettingsError: "Diese Einstellungsdatei konnte nicht gelesen werden - sie ist möglicherweise beschädigt oder kein gültiger Export.",
    editorBack: "Zurück zum Konverter",
    editorPencil: "Stift",
    editorLine: "Linie",
    editorRectangle: "Rechteck",
    editorRectangleFilled: "Gefülltes Rechteck",
    editorEllipse: "Ellipse",
    editorFill: "Füllen (Eimer)",
    editorThickness: "Stärke",
    editorColors: "Farben",
    editorPrimaryColor: "Primärfarbe (Linksklick)",
    editorSecondaryColor: "Sekundärfarbe (Rechtsklick)",
    editorTransparent: "Transparent (16. Farbe)",
    editorGrid: "Pixelraster",
    editorPreview: "Vorschau",
    editorSave: "Speichern",
    editorSaveBin: "BIN",
    editorSaveBinZx7: "BIN (ZX7-komprimiert)",
    editorOpen: "Öffnen",
    editorOpenHint: "BMP-, BIN- oder BIN.ZX7-Datei öffnen, ohne Konvertierung",
    editorPanHint: "Scrollen zum Zoomen. Mittlere Maustaste ziehen (oder die Bildlaufleisten) zum Verschieben. Linksklick = Primärfarbe, Rechtsklick = Sekundärfarbe.",
    editorSizeMismatch: "Das Bild muss genau die Zielauflösung haben.",
    editorEditButton: "Pixel-Editor",
    editorOpenBlank16: "Leeren 16-Farben-Editor öffnen (128×240)",
    editorOpenBlank4: "Leeren 4-Farben-Editor öffnen (256×240)",
    editorOpenBlank2: "Leeren 2-Farben-Editor öffnen (512×240)",
    editorOpenBlank256k: "Leeren 256k-Editor öffnen (256×240)",
    editorUnsavedWarning: "Du hast ungespeicherte Änderungen, die verloren gehen, wenn du ohne Speichern zurückgehst.",
    editorCancel: "Abbrechen",
    editorDiscardAndBack: "Verwerfen und zurück",
    editorResetWarning: "Dies setzt das Bild auf den Zustand beim Öffnen zurück und verwirft alle Änderungen. Dies kann rückgängig gemacht werden (Strg+Z).",
    editorResetConfirm: "Zurücksetzen",
    editorTransparencyToggle: "Hervorhebung der transparenten Farbe im Bild anzeigen/ausblenden",
    editorRecolorSlot: "Diese Farbe ändern",
    editorCheckerFill: "Schachbrett-Füllung: zeichnet mit Primär- und Sekundärfarbe im Karomuster",
    editorSelect: "Rechteckigen Bereich auswählen / verschieben",
    editorSelectConfirm: "Hier platzieren (Enter)",
    editorSelectCancel: "Verschieben abbrechen (Esc)",
    editorFlipH: "Horizontal spiegeln",
    editorFlipV: "Vertikal spiegeln",
    editorScrollUp: "Nach oben scrollen (umlaufend)",
    editorScrollDown: "Nach unten scrollen (umlaufend)",
    editorScrollLeft: "Nach links scrollen (umlaufend)",
    editorScrollRight: "Nach rechts scrollen (umlaufend)",
    editorRecolorHint: "Neue Farbe für diesen Platz wählen:",
    editorUnrecognizedFile: "Unbekannte oder nicht unterstützte BMP-Datei - es können nur eigene Exporte der App geöffnet werden (128×240/256×240/512×240 24bpp oder 256×240 4bpp).",
    editorOpenError: "Datei konnte nicht gelesen werden.",
    editorBinSizeMismatchTitle: "Die Dateigröße entspricht keiner bekannten Auflösung genau.",
    editorBinSizeMismatchHint: "Dateigröße: {size} Byte. Wähle, als welche Auflösung sie interpretiert werden soll (beste Vermutung ist vorausgewählt):",
    editorLoad: "Laden",
    ditherAmount: "Fehlerdiffusionsmenge",
    noiseLevel: "Rauschpegel",
    solidSnap: "Solid Area Snap",
    sourcePreview: "QUELLVORSCHAU",
    tvcModeLabel: "TVC-MODUS (2:1 STRECKUNG)",
    originalModeLabel: "ORIGINALMODUS (2:1 STRECKUNG)",
    viewScale: "1:1 Skalierung anzeigen",
    viewFullscreen: "Vollbild-Vorschau",
    noData: "Keine Daten",
    dragHelper: "Ziehen zum Positionieren • Scrollen zum Zoomen",
    downloadBmp: "Als BMP speichern",
    downloadBin: "Als TVC bin speichern",
    downloadBinZX7: "Als TVC bin speichern (ZX7)",
    saveSettings: "Einstellungen speichern",
    loadSettings: "Einstellungen laden",
    nativePreview: "Native Größenvorschau",
    nativePreviewDescTVC: (mode: string) => mode === 'tvc-2' ? "512 x 240 Pixel (1:1-Anzeige)" : mode === 'tvc-4' ? "256 x 240 Pixel (1:1-Anzeige)" : "128 x 240 Pixel (Gestreckt auf 256 x 240)",
    nativePreviewDescOriginal: (w: number, h: number) => `${w} x ${h} Pixel (Gestreckt auf ${w*2} x ${h})`,
    closePreview: "Vorschau schließen",
    error: "Fehler",
    footerMode: "TVC-MODUS: 128x240 (BREITE PIXEL)",
    footerPalette: "HARDWARE-PALETTE: 15 FARBEN",
    lab: "Videoton TV Computer (TVC) Bildgenerator // Lab",
    increase: "Erhöhen",
    decrease: "Verringern",
    centerImage: "Zentrieren",
    autoDetect: "Beste Einstellungen automatisch erkennen",
    panZoom: "Ziehen zum Schwenken • Scrollen zum Zoomen",
    headerTitle: "VIDEOTON TV COMPUTER Bildkonverter",
    facebookGroup: "Facebook-Gruppe",
    ttNew: "Neues Bild laden",
    ttSelectImage: "Wählen Sie ein Bild von Ihrem Computer aus",
    tt16Colors: "16-Farben-Modus (128x240 Auflösung)",
    tt4Colors: "4-Farben-Modus (256x240 Auflösung)",
    tt2Colors: "2-Farben-Modus (512x240 Auflösung)",
    ttOriginalMode: "Behalten Sie die ursprüngliche Auflösung des Bildes bei.",
    ttFullScreenMode: "Passen Sie die Bildgröße an den TVC-Bildschirm an.",
    ttCropFill: "Bild mit Zuschnitt füllen",
    ttLetterbox: "Vollständiges Bild anzeigen (mit schwarzen Balken)",
    ttStretchFill: "Bild auf den gesamten Bereich strecken",
    ttViewFullscreen: "Vollbildansicht",
    ttViewScale: "Originalgröße anzeigen",
    ttSelectColor: "Farbe auswählen",
    ttClosePreview: "Vorschau schließen",
    ttCancelAutoTune: "Auto-Tuning abbrechen",
    ttCenterImage: "Bild zentrieren",
    ttAutoDetect: "Beste Einstellungen automatisch erkennen",
    ttAutoTunePrecision: "Auto 4 (Präzision): Echte, auf struktureller Ähnlichkeit (SSIM) basierende Bewertung statt handjustierter Multiplikatoren",
    ttReset: "Bildeinstellungen auf Standard zurücksetzen",
    ttCopyFrom: (mode: string) => `Einstellungen kopieren von ${mode}`,
    ttDownloadBmp: "Bild im Standard-BMP-Format speichern",
    ttDownloadBmp11: "Bild als 1:1-Seitenverhältnis BMP speichern (128x240)",
    ttDownloadBmp21: "Bild als 2:1-Seitenverhältnis BMP speichern (256x240)",
    ttDownloadBin: "Bild im rohen TVC-Binärformat speichern",
    ttDownloadBinZX7: "Bild im ZX7-komprimierten TVC-Binärformat speichern",
    saveOriginalSize: "Originalgröße speichern",
    saveComposition: "Komposition speichern",
    ttSaveOriginalSize: "Wählen Sie, ob Sie die ursprünglichen Bildabmessungen oder die an die TVC-Auflösung angepasste Komposition speichern möchten.",
    ttSaveOriginalSizeBtn: "Speichern Sie das gesamte Bild in seiner ursprünglichen Auflösung mit der TVC-Palette.",
    ttSaveCompositionBtn: "Speichern Sie die aktuelle Komposition (Zoom/Pan) in fester TVC-Auflösung.",
    ttInvertColors: "Die beiden ausgewählten Farben vertauschen",
    ttLanguage: "Sprache ändern",
    ttManual: "Benutzerhandbuch",
    autoCropBorder: "Rahmen automatisch zuschneiden",
    ttAutoCropBorder: "Schneidet automatisch den einfarbigen Rahmen basierend auf dem obersten linken Pixel zu",
    trimBorderBtn: "Rahmen zuschneiden",
    ttTrimBorderBtn: "Entfernt den umgebenden einfarbigen Rahmen basierend auf dem obersten linken Pixel",
    selectedColors: "Ausgewählte Farben",
    invertColors: "Farben umkehren",
    denoise: "Rauschunterdrückung",
    unsharpMask: "Unscharf maskieren",
    toneMapping: "Tone Mapping",
    advancedSettings: "Erweiterte Einstellungen",
    serpentine: "Serpentinen-Abtastung",
    perceptualWeighting: "Perzeptueller Farbabstand",
    pixelArtCleaning: "Pixel-Art-Reinigung",
    resizeQuality: "Weiche Verkleinerung",
    ttResizeQuality: "Gamma-korrekte, flächengemittelte Verkleinerung (sauberer bei Fotos, aber langsamer). Aus: die ursprüngliche, schnelle Nearest-Neighbor-Verkleinerung.",
    autoColorSelection: "Automatische Farbauswahl (K-Means)",
    preciseAutoColor: "Präzise Auto-Farbe (Lab)",
    ttPreciseAutoColor: "Verwendet den CIELAB-Farbabstand (wahrnehmungsgleichmäßig) statt der üblichen Redmean-Näherung bei der Wahl der besten Farben. Betrifft nur diese einmalige Farbauswahl, nicht das Pixel-für-Pixel-Dithering - kann bedenkenlos aktiviert bleiben.",
    ttDenoise: "Reduziert digitales Rauschen vor der Größenänderung.",
    ttUnsharpMask: "Verbessert Kanten, um wichtige Details zu erhalten.",
    ttToneMapping: "Komprimiert den Dynamikbereich, um Details in dunklen/hellen Bereichen zu erhalten.",
    ttSerpentine: "Abwechselnde Scanrichtung zur Verbesserung der Dithering-Muster.",
    ttPerceptualWeighting: "Farbvergleich angepasst an die Empfindlichkeit des menschlichen Auges.",
    ttPixelArtCleaning: "Entfernt isolierte Pixelpunkte für ein saubereres Bild.",
    ttAutoColorSelection: "K-Means-Algorithmus zur Auswahl der besten Farben für 4- und 2-Farbmodi.",
    generateMask: "Transparenter HG",
    ttGenerateMask: "Äußeren einfarbigen Hintergrund transparent machen (Code 1000)",
    clearMask: "Maske löschen",
    ttClearMask: "Transparenzmaske entfernen",
    maskVisibility: "Transparenz",
    ttMaskVisibility: "Transparenzhervorhebung auf dem Bildschirm ein-/ausschalten",
    maskActiveBadge: "Maske aktiv",
    colorNames: [
      "Schwarz", "Dunkelblau", "Dunkelrot", "Dunkellila", 
      "Blau", "Rot", "Lila", "Dunkelgrün", 
      "Dunkelcyan", "Dunkelgelb", "Grau", "Grün", 
      "Cyan", "Gelb", "Weiß"
    ]
  },
  ru: {
    title: "Создатель изображений Videoton TV Computer (TVC)",
    new: "Новый",
    introTitle: "Создатель изображений<br/>Videoton TV Computer (TVC)",
    introDesc: "Преобразуйте любое изображение в классический 16, 4 или 2-цветный режим. Анаморфное отображение пикселей для аутентичных результатов отображения на оборудовании.",
    selectImage: "Выберите изображение или перетащите",
    autoConversion: "Автоматическое преобразование цветов",
    outputRes: "Выходное разрешение",
    tvcMode: "TVC (128x240)",
    tvc16Mode: "16 Цветов",
    tvc4Mode: "4 Цвета",
    tvc2Mode: "2 Цвета",
    originalMode: "Оригинальный размер",
    fullScreenMode: "Полный экран TVC",
    ditherMethod: "Метод дизеринга",
    catModernist: "Modernist",
    catOrdered: "Ordered (Classic)",
    catDiffusion: "Diffusion",
    patternTVC: "Pattern TVC",
    patternTVCDiffusion: "Pattern TVC (Diffusion)",
    blueNoise: "Blue Noise (Softest)",
    blueNoise16: "Blue Noise 16x16 (менее повторяющийся)",
    blueNoise16Aniso: "Blue Noise 16x16 (оптимизирован для 2:1)",
    patternMixScanline: "Строчное смешивание",
    ttPatternMixScanline: "Pattern TVC смешивает два цвета чередующимися строками вместо шахматного узора. На пикселях 2:1 в 16-цветном режиме это часто выглядит мягче.",
    ordered8: "Ordered 8x8",
    ordered4: "Ordered 4x4",
    ordered2: "Ordered 2x2",
    bayer16: "Ordered 16x16 (Bayer)",
    sierraLite: "Sierra Lite",
    stucki: "Stucki",
    burkes: "Burkes",
    jarvis: "Jarvis, Judice, Ninke",
    ostromoukhov: "Ostromoukhov (Адаптивный)",
    clusterDot: "Cluster Dot 8x8 (Halftone)",
    threshold: "Порог (Без узора)",
    none: "Нет (Постеризация)",
    composition: "Композиция",
    cropFill: "Заполнение с обрезкой",
    letterbox: "Letterbox",
    stretchFill: "Растяжение",
    zoom: "Масштаб изображения",
    hPos: "Горизонтальное положение",
    vPos: "Вертикальное положение",
    bgFill: "Заливка фона",
    adjustments: "Настройки изображения",
    reset: "Сброс",
    autoTune: "Автонастройка",
    autoTuningTitle: "Автонастройка...",
    autoTuningDesc: "Тестирование более 700 комбинаций для поиска оптимальных настроек.",
    cancelAutoTune: "Отмена",
    brightness: "Яркость",
    contrast: "Контраст",
    saturation: "Насыщенность",
    gamma: "Гамма",
    ditherTuning: "Настройка дизеринга",
    patternPairMatrix: "Запрет пар (Pattern TVC)",
    patternPairMatrixHint: "Нажмите на ячейку, чтобы запретить/разрешить смешивание этих двух цветов в шахматном узоре. Клик по ячейке на диагонали (сплошной цвет) полностью исключает этот цвет из всех пар.",
    colorBlocklist: "Запрет цветов (Yliluoma)",
    colorBlocklistHint: "Нажмите на цвет, чтобы полностью исключить/вернуть его в смешивание цветов Yliluoma.",
    exportSettingsFilenamePrompt: "Имя файла:",
    exportSettingsHint: "Сохранить настройки в текстовый файл (.tvcset) с произвольным именем",
    importSettingsHint: "Загрузить настройки из текстового файла .tvcset",
    importSettingsError: "Не удалось прочитать этот файл настроек - возможно, он повреждён или не является корректным экспортом.",
    editorBack: "Назад к конвертеру",
    editorPencil: "Карандаш",
    editorLine: "Линия",
    editorRectangle: "Прямоугольник",
    editorRectangleFilled: "Залитый прямоугольник",
    editorEllipse: "Эллипс",
    editorFill: "Заливка (ведро)",
    editorThickness: "Толщина",
    editorColors: "Цвета",
    editorPrimaryColor: "Основной цвет (левый клик)",
    editorSecondaryColor: "Дополнительный цвет (правый клик)",
    editorTransparent: "Прозрачный (16-й цвет)",
    editorGrid: "Сетка пикселей",
    editorPreview: "Предпросмотр",
    editorSave: "Сохранить",
    editorSaveBin: "BIN",
    editorSaveBinZx7: "BIN (сжатый ZX7)",
    editorOpen: "Открыть",
    editorOpenHint: "Открыть файл BMP, BIN или BIN.ZX7 без конвертации",
    editorPanHint: "Прокрутка колесом для масштабирования. Перетаскивание средней кнопкой мыши (или полосы прокрутки) для перемещения. Левый клик = основной цвет, правый клик = дополнительный цвет.",
    editorSizeMismatch: "Изображение должно точно соответствовать целевому разрешению.",
    editorEditButton: "Пиксельный редактор",
    editorOpenBlank16: "Открыть пустой 16-цветный редактор (128×240)",
    editorOpenBlank4: "Открыть пустой 4-цветный редактор (256×240)",
    editorOpenBlank2: "Открыть пустой 2-цветный редактор (512×240)",
    editorOpenBlank256k: "Открыть пустой редактор 256k (256×240)",
    editorUnsavedWarning: "У вас есть несохранённые изменения, которые будут потеряны, если вы вернётесь без сохранения.",
    editorCancel: "Отмена",
    editorDiscardAndBack: "Отменить изменения и вернуться",
    editorResetWarning: "Это вернёт изображение к состоянию на момент открытия, отменив все изменения. Это можно отменить (Ctrl+Z).",
    editorResetConfirm: "Сбросить",
    editorTransparencyToggle: "Показать/скрыть выделение прозрачного цвета на изображении",
    editorRecolorSlot: "Изменить этот цвет",
    editorCheckerFill: "Шахматная заливка: рисует узором из основного и дополнительного цвета",
    editorSelect: "Выделить / переместить прямоугольную область",
    editorSelectConfirm: "Поместить здесь (Enter)",
    editorSelectCancel: "Отменить перемещение (Esc)",
    editorFlipH: "Отразить по горизонтали",
    editorFlipV: "Отразить по вертикали",
    editorScrollUp: "Прокрутка вверх (с заворотом)",
    editorScrollDown: "Прокрутка вниз (с заворотом)",
    editorScrollLeft: "Прокрутка влево (с заворотом)",
    editorScrollRight: "Прокрутка вправо (с заворотом)",
    editorRecolorHint: "Выберите новый цвет для этого места:",
    editorUnrecognizedFile: "Нераспознанный или неподдерживаемый файл BMP - можно открывать только собственные экспортированные файлы приложения (128×240/256×240/512×240 24bpp или 256×240 4bpp).",
    editorOpenError: "Не удалось прочитать файл.",
    editorBinSizeMismatchTitle: "Размер файла точно не соответствует ни одному известному разрешению.",
    editorBinSizeMismatchHint: "Размер файла: {size} байт. Выберите, каким разрешением его считать (лучший вариант уже выбран):",
    editorLoad: "Загрузить",
    ditherAmount: "Количество диффузии ошибки",
    noiseLevel: "Уровень шума",
    solidSnap: "Привязка к сплошным областям",
    sourcePreview: "ПРЕДПРОСМОТР ИСТОЧНИКА",
    tvcModeLabel: "РЕЖИМ TVC (РАСТЯЖЕНИЕ 2:1)",
    originalModeLabel: "ОРИГИНАЛЬНЫЙ РЕЖИМ (РАСТЯЖЕНИЕ 2:1)",
    viewScale: "Просмотр в масштабе 1:1",
    viewFullscreen: "Полноэкранный предпросмотр",
    noData: "Нет данных",
    dragHelper: "Перетащите для позиционирования • Прокрутите для масштабирования",
    downloadBmp: "Сохранить как BMP",
    downloadBin: "Сохранить как TVC bin",
    downloadBinZX7: "Сохранить как TVC bin (ZX7)",
    saveSettings: "Сохранить настройки",
    loadSettings: "Загрузить настройки",
    nativePreview: "Предпросмотр нативного размера",
    nativePreviewDescTVC: (mode: string) => mode === 'tvc-2' ? "512 x 240 пикселей (отображение 1:1)" : mode === 'tvc-4' ? "256 x 240 пикселей (отображение 1:1)" : "128 x 240 пикселей (Растянуто до 256 x 240)",
    nativePreviewDescOriginal: (w: number, h: number) => `${w} x ${h} пикселей (Растянуто до ${w*2} x ${h})`,
    closePreview: "Закрыть предпросмотр",
    error: "Ошибка",
    footerMode: "РЕЖИМ TVC: 128x240 (ШИРОКИЕ ПИКСЕЛИ)",
    footerPalette: "АППАРАТНАЯ ПАЛИТРА: 15 ЦВЕТОВ",
    lab: "Создатель изображений Videoton TV Computer (TVC) // Lab",
    increase: "Увеличить",
    decrease: "Уменьшить",
    centerImage: "Центр",
    autoDetect: "Автоопределение лучших настроек",
    panZoom: "Перетащите для панорамирования • Прокрутите для масштабирования",
    headerTitle: "Конвертер изображений VIDEOTON TV COMPUTER",
    facebookGroup: "Группа в Facebook",
    ttNew: "Загрузить новое изображение",
    ttSelectImage: "Выберите изображение с вашего компьютера",
    tt16Colors: "16-цветный режим (разрешение 128x240)",
    tt4Colors: "4-цветный режим (разрешение 256x240)",
    tt2Colors: "2-цветный режим (разрешение 512x240)",
    ttOriginalMode: "Сохранить исходное разрешение изображения.",
    ttFullScreenMode: "Настроить размер изображения под экран TVC.",
    ttCropFill: "Заполнить изображение с обрезкой",
    ttLetterbox: "Показать полное изображение (с черными полосами)",
    ttStretchFill: "Растянуть изображение на всю область",
    ttViewFullscreen: "Полноэкранный просмотр",
    ttViewScale: "Просмотр в оригинальном размере",
    ttSelectColor: "Выбрать цвет",
    ttClosePreview: "Закрыть предпросмотр",
    ttCancelAutoTune: "Отменить автонастройку",
    ttCenterImage: "Центрировать изображение",
    ttAutoDetect: "Автоопределение лучших настроек",
    ttAutoTunePrecision: "Авто 4 (Точность): Оценка на основе истинного структурного сходства (SSIM) вместо вручную подобранных коэффициентов",
    ttReset: "Сбросить настройки изображения по умолчанию",
    ttCopyFrom: (mode: string) => `Копировать настройки из ${mode}`,
    ttDownloadBmp: "Сохранить изображение в стандартном формате BMP",
    ttDownloadBmp11: "Сохранить изображение как 1:1 BMP (128x240)",
    ttDownloadBmp21: "Сохранить изображение как 2:1 BMP (256x240)",
    ttDownloadBin: "Сохранить изображение в сыром бинарном формате TVC",
    ttDownloadBinZX7: "Сохранить изображение в бинарном формате TVC со сжатием ZX7",
    saveOriginalSize: "Сохранить оригинал",
    saveComposition: "Сохранить композицию",
    ttSaveOriginalSize: "Выберите, сохранять ли исходные размеры изображения или композицию, адаптированную к разрешению TVC.",
    ttSaveOriginalSizeBtn: "Сохранить полное изображение в исходном разрешении с использованием палитры TVC.",
    ttSaveCompositionBtn: "Сохранить текущую композицию (масштаб/панорама) в фиксированном разрешении TVC.",
    ttInvertColors: "Поменять местами два выбранных цвета",
    ttLanguage: "Изменить язык",
    ttManual: "Руководство пользователя",
    autoCropBorder: "Автообрезка рамки",
    ttAutoCropBorder: "Автоматически обрезает однотонную рамку вокруг изображения на основе верхнего левого пикселя",
    trimBorderBtn: "Обрезать рамку",
    ttTrimBorderBtn: "Удалить окружающую однотонную рамку на основе верхнего левого пикселя",
    selectedColors: "Выбранные цвета",
    invertColors: "Инвертировать цвета",
    denoise: "Шумоподавление",
    unsharpMask: "Контурная резкость",
    toneMapping: "Тональное отображение",
    advancedSettings: "Расширенные настройки",
    serpentine: "Серпантинное сканирование",
    perceptualWeighting: "Перцептивное цветовое расстояние",
    pixelArtCleaning: "Очистка пиксель-арта",
    resizeQuality: "Плавное масштабирование",
    ttResizeQuality: "Гамма-корректное усреднение области при уменьшении (чище для фото, но медленнее). Выключено: исходное, быстрое масштабирование методом ближайшего соседа.",
    autoColorSelection: "Автовыбор цветов (K-Means)",
    preciseAutoColor: "Точный автовыбор цвета (Lab)",
    ttPreciseAutoColor: "Использует цветовое расстояние CIELAB (перцептивно равномерное) вместо обычного приближения redmean при выборе лучших цветов. Влияет только на этот однократный выбор цвета, а не на подекселное дизеринг - можно смело оставить включённым.",
    ttDenoise: "Уменьшает цифровой шум перед изменением размера.",
    ttUnsharpMask: "Усиливает края для сохранения важных деталей.",
    ttToneMapping: "Сжимает динамический диапазон для сохранения деталей в темных/светлых областях.",
    ttSerpentine: "Чередующееся направление сканирования для улучшения узоров дизеринга.",
    ttPerceptualWeighting: "Сравнение цветов, адаптированное к чувствительности человеческого глаза.",
    ttPixelArtCleaning: "Удаляет изолированные пиксельные точки для более чистого изображения.",
    ttAutoColorSelection: "Алгоритм K-Means для выбора лучших цветов для 4-х и 2-х цветных режимов.",
    generateMask: "Прозрачный фон",
    ttGenerateMask: "Сделать внешний сплошной фон прозрачным (код 1000)",
    clearMask: "Сбросить маску",
    ttClearMask: "Удалить маску прозрачности",
    maskVisibility: "Прозрачность",
    ttMaskVisibility: "Включить/выключить отображение прозрачности на экране",
    maskActiveBadge: "Маска активна",
    colorNames: [
      "Черный", "Темно-синий", "Темно-красный", "Темно-фиолетовый", 
      "Синий", "Красный", "Фиолетовый", "Темно-зеленый", 
      "Темно-голубой", "Темно-желтый", "Серый", "Зеленый", 
      "Голубой", "Желтый", "Белый"
    ]
  },
  uk: {
    title: "Створювач зображень Videoton TV Computer (TVC)",
    new: "Новий",
    introTitle: "Створювач зображень<br/>Videoton TV Computer (TVC)",
    introDesc: "Перетворіть будь-яке зображення на класичний 16, 4 або 2-колірний режим. Анаморфне відображення пікселів для автентичних результатів відображення на обладнанні.",
    selectImage: "Виберіть зображення або перетягніть",
    autoConversion: "Автоматичне перетворення кольорів",
    outputRes: "Вихідна роздільна здатність",
    tvcMode: "TVC (128x240)",
    tvc16Mode: "16 Кольорів",
    tvc4Mode: "4 Кольори",
    tvc2Mode: "2 Кольори",
    originalMode: "Оригінальний розмір",
    fullScreenMode: "Повний екран TVC",
    ditherMethod: "Метод дизерингу",
    catModernist: "Modernist",
    catOrdered: "Ordered (Classic)",
    catDiffusion: "Diffusion",
    patternTVC: "Pattern TVC",
    patternTVCDiffusion: "Pattern TVC (Diffusion)",
    blueNoise: "Blue Noise (Softest)",
    blueNoise16: "Blue Noise 16x16 (менш повторюваний)",
    blueNoise16Aniso: "Blue Noise 16x16 (оптимізований для 2:1)",
    patternMixScanline: "Рядкове змішування",
    ttPatternMixScanline: "Pattern TVC змішує два кольори рядками, що чергуються, замість шахового візерунка. На пікселях 2:1 у 16-кольоровому режимі це часто виглядає плавніше.",
    ordered8: "Ordered 8x8",
    ordered4: "Ordered 4x4",
    ordered2: "Ordered 2x2",
    bayer16: "Ordered 16x16 (Bayer)",
    sierraLite: "Sierra Lite",
    stucki: "Stucki",
    burkes: "Burkes",
    jarvis: "Jarvis, Judice, Ninke",
    ostromoukhov: "Ostromoukhov (Адаптивний)",
    clusterDot: "Cluster Dot 8x8 (Halftone)",
    threshold: "Поріг (Без візерунка)",
    none: "Немає (Постеризація)",
    composition: "Композиція",
    cropFill: "Заповнення з обрізкою",
    letterbox: "Letterbox",
    stretchFill: "Розтягування",
    zoom: "Масштаб зображення",
    hPos: "Горизонтальне положення",
    vPos: "Вертикальне положення",
    bgFill: "Заливка фону",
    adjustments: "Налаштування зображення",
    reset: "Скинути",
    autoTune: "Автоналаштування",
    autoTuningTitle: "Автоналаштування...",
    autoTuningDesc: "Тестування понад 700 комбінацій для пошуку оптимальних налаштувань.",
    cancelAutoTune: "Скасувати",
    brightness: "Яскравість",
    contrast: "Контраст",
    saturation: "Насиченість",
    gamma: "Гамма",
    ditherTuning: "Налаштування дизерингу",
    patternPairMatrix: "Заборона пар (Pattern TVC)",
    patternPairMatrixHint: "Натисніть на комірку, щоб заборонити/дозволити змішування цих двох кольорів у шаховому візерунку. Клік по клітинці на діагоналі (суцільний колір) повністю виключає цей колір з усіх пар.",
    colorBlocklist: "Заборона кольорів (Yliluoma)",
    colorBlocklistHint: "Натисніть на колір, щоб повністю виключити/повернути його у змішування кольорів Yliluoma.",
    exportSettingsFilenamePrompt: "Ім'я файлу:",
    exportSettingsHint: "Зберегти налаштування у текстовий файл (.tvcset) з довільною назвою",
    importSettingsHint: "Завантажити налаштування з текстового файлу .tvcset",
    importSettingsError: "Не вдалося прочитати цей файл налаштувань - можливо, він пошкоджений або не є коректним експортом.",
    editorBack: "Назад до конвертера",
    editorPencil: "Олівець",
    editorLine: "Лінія",
    editorRectangle: "Прямокутник",
    editorRectangleFilled: "Залитий прямокутник",
    editorEllipse: "Еліпс",
    editorFill: "Заливка (відро)",
    editorThickness: "Товщина",
    editorColors: "Кольори",
    editorPrimaryColor: "Основний колір (лівий клік)",
    editorSecondaryColor: "Додатковий колір (правий клік)",
    editorTransparent: "Прозорий (16-й колір)",
    editorGrid: "Сітка пікселів",
    editorPreview: "Попередній перегляд",
    editorSave: "Зберегти",
    editorSaveBin: "BIN",
    editorSaveBinZx7: "BIN (стиснутий ZX7)",
    editorOpen: "Відкрити",
    editorOpenHint: "Відкрити файл BMP, BIN або BIN.ZX7 без конвертації",
    editorPanHint: "Прокрутка коліщатком для масштабування. Перетягування середньою кнопкою миші (або смуги прокрутки) для переміщення. Лівий клік = основний колір, правий клік = додатковий колір.",
    editorSizeMismatch: "Зображення має точно відповідати цільовій роздільній здатності.",
    editorEditButton: "Піксельний редактор",
    editorOpenBlank16: "Відкрити порожній 16-кольоровий редактор (128×240)",
    editorOpenBlank4: "Відкрити порожній 4-кольоровий редактор (256×240)",
    editorOpenBlank2: "Відкрити порожній 2-кольоровий редактор (512×240)",
    editorOpenBlank256k: "Відкрити порожній редактор 256k (256×240)",
    editorUnsavedWarning: "У вас є незбережені зміни, які буде втрачено, якщо ви повернетесь без збереження.",
    editorCancel: "Скасувати",
    editorDiscardAndBack: "Відхилити і повернутися",
    editorResetWarning: "Це поверне зображення до стану на момент відкриття, відхиливши всі зміни. Це можна скасувати (Ctrl+Z).",
    editorResetConfirm: "Скинути",
    editorTransparencyToggle: "Показати/приховати виділення прозорого кольору на зображенні",
    editorRecolorSlot: "Змінити цей колір",
    editorCheckerFill: "Шахова заливка: малює візерунком з основного та додаткового кольору",
    editorSelect: "Виділити / перемістити прямокутну область",
    editorSelectConfirm: "Розмістити тут (Enter)",
    editorSelectCancel: "Скасувати переміщення (Esc)",
    editorFlipH: "Відобразити горизонтально",
    editorFlipV: "Відобразити вертикально",
    editorScrollUp: "Прокрутка вгору (із загортанням)",
    editorScrollDown: "Прокрутка вниз (із загортанням)",
    editorScrollLeft: "Прокрутка ліворуч (із загортанням)",
    editorScrollRight: "Прокрутка праворуч (із загортанням)",
    editorRecolorHint: "Виберіть новий колір для цього місця:",
    editorUnrecognizedFile: "Нерозпізнаний або непідтримуваний файл BMP - можна відкривати лише власні експортовані файли застосунку (128×240/256×240/512×240 24bpp або 256×240 4bpp).",
    editorOpenError: "Не вдалося прочитати файл.",
    editorBinSizeMismatchTitle: "Розмір файлу точно не відповідає жодній відомій роздільній здатності.",
    editorBinSizeMismatchHint: "Розмір файлу: {size} байт. Виберіть, як яку роздільну здатність його інтерпретувати (найкращий варіант вже вибрано):",
    editorLoad: "Завантажити",
    ditherAmount: "Кількість дифузії помилки",
    noiseLevel: "Рівень шуму",
    solidSnap: "Прив'язка до суцільних областей",
    sourcePreview: "ПОПЕРЕДНІЙ ПЕРЕГЛЯД ДЖЕРЕЛА",
    tvcModeLabel: "РЕЖИМ TVC (РОЗТЯГУВАННЯ 2:1)",
    originalModeLabel: "ОРИГІНАЛЬНИЙ РЕЖИМ (РОЗТЯГУВАННЯ 2:1)",
    viewScale: "Перегляд у масштабі 1:1",
    viewFullscreen: "Повноекранний перегляд",
    noData: "Немає даних",
    dragHelper: "Перетягніть для позиціонування • Прокрутіть для масштабування",
    downloadBmp: "Зберегти як BMP",
    downloadBin: "Зберегти як TVC bin",
    downloadBinZX7: "Зберегти як TVC bin (ZX7)",
    saveSettings: "Зберегти налаштування",
    loadSettings: "Завантажити налаштування",
    nativePreview: "Попередній перегляд нативного розміру",
    nativePreviewDescTVC: (mode: string) => mode === 'tvc-2' ? "512 x 240 пікселів (відображення 1:1)" : mode === 'tvc-4' ? "256 x 240 пікселів (відображення 1:1)" : "128 x 240 пікселів (Розтягнуто до 256 x 240)",
    nativePreviewDescOriginal: (w: number, h: number) => `${w} x ${h} пікселів (Розтягнуто до ${w*2} x ${h})`,
    closePreview: "Закрити перегляд",
    error: "Помилка",
    footerMode: "РЕЖИМ TVC: 128x240 (ШИРОКІ ПІКСЕЛІ)",
    footerPalette: "АПАРАТНА ПАЛІТРА: 15 КОЛЬОРІВ",
    lab: "Створювач зображень Videoton TV Computer (TVC) // Lab",
    increase: "Збільшити",
    decrease: "Зменшити",
    centerImage: "Центр",
    autoDetect: "Автовизначення найкращих налаштувань",
    panZoom: "Перетягніть для панорамування • Прокрутіть для масштабування",
    headerTitle: "Конвертер зображень VIDEOTON TV COMPUTER",
    facebookGroup: "Група у Facebook",
    ttNew: "Завантажити нове зображення",
    ttSelectImage: "Виберіть зображення з вашого комп'ютера",
    tt16Colors: "16-колірний режим (роздільна здатність 128x240)",
    tt4Colors: "4-колірний режим (роздільна здатність 256x240)",
    tt2Colors: "2-колірний режим (роздільна здатність 512x240)",
    ttOriginalMode: "Зберегти початкову роздільну здатність зображення.",
    ttFullScreenMode: "Налаштувати розмір зображення під екран TVC.",
    ttCropFill: "Заповнити зображення з обрізкою",
    ttLetterbox: "Показати повне зображення (з чорними смугами)",
    ttStretchFill: "Розтягнути зображення на всю область",
    ttViewFullscreen: "Повноекранний перегляд",
    ttViewScale: "Перегляд в оригінальному розмірі",
    ttSelectColor: "Вибрати колір",
    ttClosePreview: "Закрити попередній перегляд",
    ttCancelAutoTune: "Скасувати автоналаштування",
    ttCenterImage: "Центрувати зображення",
    ttAutoDetect: "Автовизначення найкращих налаштувань",
    ttAutoTunePrecision: "Авто 4 (Точність): Оцінка на основі справжньої структурної подібності (SSIM) замість вручну підібраних коефіцієнтів",
    ttReset: "Скинути налаштування зображення за замовчуванням",
    ttCopyFrom: (mode: string) => `Копіювати налаштування з ${mode}`,
    ttDownloadBmp: "Зберегти зображення у стандартному форматі BMP",
    ttDownloadBmp11: "Зберегти зображення як 1:1 BMP (128x240)",
    ttDownloadBmp21: "Зберегти зображення як 2:1 BMP (256x240)",
    ttDownloadBin: "Зберегти зображення у сирому бінарному форматі TVC",
    ttDownloadBinZX7: "Зберегти зображення у бінарному форматі TVC зі стисненням ZX7",
    saveOriginalSize: "Зберегти оригінал",
    saveComposition: "Зберегти композицію",
    ttSaveOriginalSize: "Виберіть, чи зберігати вихідні розміри зображення, чи композицію, адаптовану до роздільної здатності TVC.",
    ttSaveOriginalSizeBtn: "Зберегти повне зображення в оригінальній роздільній здатності з використанням палітри TVC.",
    ttSaveCompositionBtn: "Зберегти поточну композицію (масштаб/панорама) у фіксованій роздільній здатності TVC.",
    ttInvertColors: "Поміняти місцями два вибраних кольори",
    ttLanguage: "Змінити мову",
    ttManual: "Посібник користувача",
    autoCropBorder: "Автообрізка рамки",
    ttAutoCropBorder: "Автоматично обрізає однотонну рамку навколо зображення на основі верхнього лівого пікселя",
    trimBorderBtn: "Обрізати рамку",
    ttTrimBorderBtn: "Видалити навколишню однотонну рамку на основі верхнього лівого пікселя",
    selectedColors: "Вибрані кольори",
    invertColors: "Інвертувати кольори",
    denoise: "Шумозаглушення",
    unsharpMask: "Контурна різкість",
    toneMapping: "Тональне відображення",
    advancedSettings: "Розширені налаштування",
    serpentine: "Серпантинне сканування",
    perceptualWeighting: "Перцептивна колірна відстань",
    pixelArtCleaning: "Очищення піксель-арту",
    resizeQuality: "Плавне масштабування",
    ttResizeQuality: "Гамма-коректне усереднення області при зменшенні (чистіше для фото, але повільніше). Вимкнено: початкове, швидке масштабування методом найближчого сусіда.",
    autoColorSelection: "Автовибір кольорів (K-Means)",
    preciseAutoColor: "Точний автовибір кольору (Lab)",
    ttPreciseAutoColor: "Використовує колірну відстань CIELAB (перцептивно рівномірну) замість звичайного наближення redmean при виборі найкращих кольорів. Впливає лише на цей одноразовий вибір кольору, а не на попіксельний дизеринг - можна спокійно залишити увімкненим.",
    ttDenoise: "Зменшує цифровий шум перед зміною розміру.",
    ttUnsharpMask: "Посилює краї для збереження важливих деталей.",
    ttToneMapping: "Стискає динамічний діапазон для збереження деталей у темних/світлих областях.",
    ttSerpentine: "Чергування напрямку сканування для покращення візерунків дизерингу.",
    ttPerceptualWeighting: "Порівняння кольорів, адаптоване до чутливості людського ока.",
    ttPixelArtCleaning: "Видаляє ізольовані піксельні точки для більш чистого зображення.",
    ttAutoColorSelection: "Алгоритм K-Means для вибору найкращих кольорів для 4-х та 2-х колірних режимів.",
    generateMask: "Прозорий фон",
    ttGenerateMask: "Зробити зовнішній суцільний фон прозорим (код 1000)",
    clearMask: "Скинути маску",
    ttClearMask: "Видалити маску прозорості",
    maskVisibility: "Прозорість",
    ttMaskVisibility: "Увімкнути/вимкнути відображення прозорості на екрані",
    maskActiveBadge: "Маска активна",
    colorNames: [
      "Чорний", "Темно-синій", "Темно-червоний", "Темно-фіолетовий", 
      "Синій", "Червоний", "Фіолетовый", "Темно-зелений", 
      "Темно-блакитний", "Темно-жовтий", "Сірий", "Зелений", 
      "Блакитний", "Жовтий", "Білий"
    ]
  },
  es: {
    title: "Creador de imágenes Videoton TV Computer (TVC)",
    new: "Nuevo",
    introTitle: "Creador de imágenes<br/>Videoton TV Computer (TVC)",
    introDesc: "Convierte cualquier imagen al modo clásico de 16, 4 o 2 colores. Mapeo de píxeles anamórfico para resultados de visualización de hardware auténticos.",
    selectImage: "Seleccionar imagen o arrastrar y soltar",
    autoConversion: "Conversión automática de colores",
    outputRes: "Resolución de salida",
    tvcMode: "TVC (128x240)",
    tvc16Mode: "16 Colores",
    tvc4Mode: "4 Colores",
    tvc2Mode: "2 Colores",
    originalMode: "Tamaño original",
    fullScreenMode: "Pantalla completa TVC",
    ditherMethod: "Método de tramado",
    catModernist: "Modernist",
    catOrdered: "Ordered (Classic)",
    catDiffusion: "Diffusion",
    patternTVC: "Pattern TVC",
    patternTVCDiffusion: "Pattern TVC (Diffusion)",
    blueNoise: "Blue Noise (Softest)",
    blueNoise16: "Blue Noise 16x16 (menos repetitivo)",
    blueNoise16Aniso: "Blue Noise 16x16 (optimizado para 2:1)",
    patternMixScanline: "Mezcla por líneas",
    ttPatternMixScanline: "Pattern TVC mezcla los dos colores en filas alternas en lugar de un damero. En los píxeles 2:1 del modo de 16 colores esto suele fundirse con más suavidad.",
    ordered8: "Ordered 8x8",
    ordered4: "Ordered 4x4",
    ordered2: "Ordered 2x2",
    bayer16: "Ordered 16x16 (Bayer)",
    sierraLite: "Sierra Lite",
    stucki: "Stucki",
    burkes: "Burkes",
    jarvis: "Jarvis, Judice, Ninke",
    ostromoukhov: "Ostromoukhov (Adaptativo)",
    clusterDot: "Cluster Dot 8x8 (Halftone)",
    threshold: "Umbral (Sin patrón)",
    none: "Ninguno (Posterizar)",
    composition: "Composición",
    cropFill: "Rellenar recorte",
    letterbox: "Letterbox",
    stretchFill: "Estirar",
    zoom: "Zoom de imagen",
    hPos: "Posición horizontal",
    vPos: "Posición vertical",
    bgFill: "Relleno de fondo",
    adjustments: "Ajustes de imagen",
    reset: "Restablecer",
    autoTune: "Auto Tune",
    autoTuningTitle: "Ajuste automático...",
    autoTuningDesc: "Probando más de 700 combinaciones para encontrar la configuración óptima.",
    cancelAutoTune: "Cancelar",
    brightness: "Brillo",
    contrast: "Contraste",
    saturation: "Saturación",
    gamma: "Gamma",
    ditherTuning: "Ajuste de tramado",
    patternPairMatrix: "Bloqueo de pares (Pattern TVC)",
    patternPairMatrixHint: "Haz clic en una celda para bloquear/permitir la mezcla en damero de esos dos colores. Al hacer clic en una celda diagonal (color sólido) se excluye ese color por completo de todos los pares.",
    colorBlocklist: "Bloqueo de colores (Yliluoma)",
    colorBlocklistHint: "Haz clic en un color para excluirlo/restaurarlo por completo de la mezcla de colores de Yliluoma.",
    exportSettingsFilenamePrompt: "Nombre de archivo:",
    exportSettingsHint: "Guardar los ajustes en un archivo de texto (.tvcset) con el nombre que elijas",
    importSettingsHint: "Cargar ajustes desde un archivo de texto .tvcset",
    importSettingsError: "No se pudo leer este archivo de ajustes - puede estar dañado o no ser una exportación válida.",
    editorBack: "Volver al conversor",
    editorPencil: "Lápiz",
    editorLine: "Línea",
    editorRectangle: "Rectángulo",
    editorRectangleFilled: "Rectángulo relleno",
    editorEllipse: "Elipse",
    editorFill: "Relleno (cubo)",
    editorThickness: "Grosor",
    editorColors: "Colores",
    editorPrimaryColor: "Color primario (clic izquierdo)",
    editorSecondaryColor: "Color secundario (clic derecho)",
    editorTransparent: "Transparente (16.º color)",
    editorGrid: "Cuadrícula de píxeles",
    editorPreview: "Vista previa",
    editorSave: "Guardar",
    editorSaveBin: "BIN",
    editorSaveBinZx7: "BIN (comprimido ZX7)",
    editorOpen: "Abrir",
    editorOpenHint: "Abrir un archivo BMP, BIN o BIN.ZX7, sin conversión",
    editorPanHint: "Desplázate para hacer zoom. Arrastra con el botón central (o las barras de desplazamiento) para mover. Clic izquierdo = color primario, clic derecho = color secundario.",
    editorSizeMismatch: "La imagen debe tener exactamente la resolución de destino.",
    editorEditButton: "Editor de píxeles",
    editorOpenBlank16: "Abrir editor vacío de 16 colores (128×240)",
    editorOpenBlank4: "Abrir editor vacío de 4 colores (256×240)",
    editorOpenBlank2: "Abrir editor vacío de 2 colores (512×240)",
    editorOpenBlank256k: "Abrir editor vacío 256k (256×240)",
    editorUnsavedWarning: "Tienes cambios sin guardar que se perderán si vuelves sin guardar.",
    editorCancel: "Cancelar",
    editorDiscardAndBack: "Descartar y volver",
    editorResetWarning: "Esto restablecerá la imagen al estado en que estaba al abrirla, descartando todos los cambios. Se puede deshacer (Ctrl+Z).",
    editorResetConfirm: "Restablecer",
    editorTransparencyToggle: "Mostrar/ocultar el resaltado del color transparente en la imagen",
    editorRecolorSlot: "Cambiar este color",
    editorCheckerFill: "Relleno en damero: dibuja con el color primario y secundario en patrón de cuadros",
    editorSelect: "Seleccionar / mover un área rectangular",
    editorSelectConfirm: "Colocar aquí (Enter)",
    editorSelectCancel: "Cancelar movimiento (Esc)",
    editorFlipH: "Voltear horizontalmente",
    editorFlipV: "Voltear verticalmente",
    editorScrollUp: "Desplazar arriba (da la vuelta)",
    editorScrollDown: "Desplazar abajo (da la vuelta)",
    editorScrollLeft: "Desplazar izquierda (da la vuelta)",
    editorScrollRight: "Desplazar derecha (da la vuelta)",
    editorRecolorHint: "Elige un nuevo color para esta posición:",
    editorUnrecognizedFile: "Archivo BMP no reconocido o no compatible - solo se pueden abrir las exportaciones propias de la app (128×240/256×240/512×240 24bpp, o 256×240 4bpp).",
    editorOpenError: "No se pudo leer el archivo.",
    editorBinSizeMismatchTitle: "El tamaño del archivo no coincide exactamente con ninguna resolución conocida.",
    editorBinSizeMismatchHint: "Tamaño del archivo: {size} bytes. Elige como qué resolución interpretarlo (la mejor suposición ya está preseleccionada):",
    editorLoad: "Cargar",
    ditherAmount: "Cantidad de difusión de error",
    noiseLevel: "Nivel de ruido",
    solidSnap: "Ajuste de área sólida",
    sourcePreview: "VISTA PREVIA DE ORIGEN",
    tvcModeLabel: "MODO TVC (ESTIRAMIENTO 2:1)",
    originalModeLabel: "MODO ORIGINAL (ESTIRAMIENTO 2:1)",
    viewScale: "Ver escala 1:1",
    viewFullscreen: "Vista previa a pantalla completa",
    noData: "Sin datos",
    dragHelper: "Arrastrar para posicionar • Desplazar para zoom",
    downloadBmp: "Guardar como BMP",
    downloadBin: "Guardar como TVC bin",
    downloadBinZX7: "Guardar como TVC bin (ZX7)",
    saveSettings: "Guardar configuración",
    loadSettings: "Cargar configuración",
    nativePreview: "Vista previa de tamaño nativo",
    nativePreviewDescTVC: (mode: string) => mode === 'tvc-2' ? "512 x 240 píxeles (pantalla 1:1)" : mode === 'tvc-4' ? "256 x 240 píxeles (pantalla 1:1)" : "128 x 240 píxeles (Estirado a 256 x 240)",
    nativePreviewDescOriginal: (w: number, h: number) => `${w} x ${h} píxeles (Estirado a ${w*2} x ${h})`,
    closePreview: "Cerrar vista previa",
    error: "Error",
    footerMode: "MODO TVC: 128x240 (PÍXELES ANCHOS)",
    footerPalette: "PALETA DE HARDWARE: 15 COLORES",
    lab: "Creador de imágenes Videoton TV Computer (TVC) // Lab",
    increase: "Aumentar",
    decrease: "Disminuir",
    centerImage: "Centrar",
    autoDetect: "Detectar automáticamente los mejores ajustes",
    panZoom: "Arrastrar para Panorámica • Desplazar para Zoom",
    headerTitle: "Convertidor de imágenes VIDEOTON TV COMPUTER",
    facebookGroup: "Grupo de Facebook",
    ttNew: "Cargar una nueva imagen",
    ttSelectImage: "Selecciona una imagen de tu computadora",
    tt16Colors: "Modo de 16 colores (resolución 128x240)",
    tt4Colors: "Modo de 4 colores (resolución 256x240)",
    tt2Colors: "Modo de 2 colores (resolución 512x240)",
    ttOriginalMode: "Mantener la resolución original de la imagen.",
    ttFullScreenMode: "Ajustar el tamaño de la imagen a la pantalla del TVC.",
    ttCropFill: "Rellenar imagen con recorte",
    ttLetterbox: "Mostrar imagen completa (con barras negras)",
    ttStretchFill: "Estirar imagen para llenar el área",
    ttViewFullscreen: "Ver en pantalla completa",
    ttViewScale: "Ver tamaño original",
    ttSelectColor: "Seleccionar color",
    ttClosePreview: "Cerrar vista previa",
    ttCancelAutoTune: "Cancelar ajuste automático",
    ttCenterImage: "Centrar imagen",
    ttAutoDetect: "Detectar automáticamente los mejores ajustes",
    ttAutoTunePrecision: "Auto 4 (Precisión): Puntuación basada en similitud estructural real (SSIM) en lugar de multiplicadores ajustados manualmente",
    ttReset: "Restablecer los ajustes de imagen a los valores predeterminados",
    ttCopyFrom: (mode: string) => `Copiar ajustes de ${mode}`,
    ttDownloadBmp: "Guardar imagen en formato BMP estándar",
    ttDownloadBmp11: "Guardar imagen como BMP de relación 1:1 (128x240)",
    ttDownloadBmp21: "Guardar imagen como BMP de relación 2:1 (256x240)",
    ttDownloadBin: "Guardar imagen en formato binario TVC sin procesar",
    ttDownloadBinZX7: "Guardar imagen en formato binario TVC comprimido con ZX7",
    saveOriginalSize: "Guardar tamaño original",
    saveComposition: "Guardar composición",
    ttSaveOriginalSize: "Elija si desea guardar las dimensiones originales de la imagen o la composición ajustada a la resolución de TVC.",
    ttSaveOriginalSizeBtn: "Guarde la imagen completa en su resolución original utilizando la paleta TVC.",
    ttSaveCompositionBtn: "Guarde la composición actual (zoom/pan) en una resolución fija de TVC.",
    ttInvertColors: "Intercambiar los dos colores seleccionados",
    ttLanguage: "Cambiar idioma",
    ttManual: "Manual del usuario",
    autoCropBorder: "Recorte automático de borde",
    ttAutoCropBorder: "Recorta automáticamente el borde de color sólido basándose en el píxel superior izquierdo",
    trimBorderBtn: "Recortar borde",
    ttTrimBorderBtn: "Eliminar el borde de color sólido basándose en el píxel superior izquierdo",
    selectedColors: "Colores seleccionados",
    invertColors: "Invertir colores",
    denoise: "Reducción de ruido",
    unsharpMask: "Máscara de enfoque",
    toneMapping: "Mapeo de tonos",
    advancedSettings: "Ajustes avanzados",
    serpentine: "Escaneo serpentino",
    perceptualWeighting: "Distancia de color perceptiva",
    pixelArtCleaning: "Limpieza de Pixel Art",
    resizeQuality: "Reducción suave",
    ttResizeQuality: "Reducción con promediado de área y corrección gamma (más limpio en fotos, pero más lento). Desactivado: la reducción original y rápida por vecino más cercano.",
    autoColorSelection: "Selección automática de color (K-Means)",
    preciseAutoColor: "Color Automático Preciso (Lab)",
    ttPreciseAutoColor: "Usa la distancia de color CIELAB (perceptualmente uniforme) en lugar de la aproximación redmean habitual al elegir los mejores colores. Solo afecta a esta selección de color única, no al tramado por píxel - se puede dejar activado sin problema.",
    ttDenoise: "Reduce el ruido digital antes de cambiar el tamaño.",
    ttUnsharpMask: "Mejora los bordes para preservar detalles importantes.",
    ttToneMapping: "Comprime el rango dinámico para preservar detalles en áreas oscuras/brillantes.",
    ttSerpentine: "Dirección de escaneo alterna para mejorar los patrones de tramado.",
    ttPerceptualWeighting: "Comparación de colores ajustada a la sensibilidad del ojo humano.",
    ttPixelArtCleaning: "Elimina puntos de píxeles aislados para una imagen más limpia.",
    ttAutoColorSelection: "Algoritmo K-Means para seleccionar los mejores colores para los modos de 4 y 2 colores.",
    generateMask: "Fondo transparente",
    ttGenerateMask: "Hacer transparente el fondo exterior uniforme (código 1000)",
    clearMask: "Borrar máscara",
    ttClearMask: "Eliminar máscara de transparencia",
    maskVisibility: "Transparencia",
    ttMaskVisibility: "Alternar el resaltado de transparencia en pantalla",
    maskActiveBadge: "Máscara activa",
    colorNames: [
      "Negro", "Azul oscuro", "Rojo oscuro", "Morado oscuro", 
      "Azul", "Rojo", "Morado", "Verde oscuro", 
      "Cian oscuro", "Amarillo oscuro", "Gris", "Verde", 
      "Cian", "Amarillo", "Blanco"
    ]
  },
  sk: {
    title: "Generátor obrázkov Videoton TV Computer (TVC)",
    new: "Nový",
    introTitle: "Generátor obrázkov<br/>Videoton TV Computer (TVC)",
    introDesc: "Preveďte akýkoľvek obrázok do klasického 16, 4 alebo 2-farebného režimu. Anamorfné mapovanie pixelov pre autentické výsledky zobrazenia na hardvéri.",
    selectImage: "Vyberte obrázok alebo pretiahnite",
    autoConversion: "Automatická farebná konverzia",
    outputRes: "Výstupné rozlíšenie",
    tvcMode: "TVC (128x240)",
    tvc16Mode: "16 Farieb",
    tvc4Mode: "4 Farby",
    tvc2Mode: "2 Farby",
    originalMode: "Originálna veľkosť",
    fullScreenMode: "Celá obrazovka TVC",
    ditherMethod: "Metóda ditheringu",
    catModernist: "Modernist",
    catOrdered: "Ordered (Classic)",
    catDiffusion: "Diffusion",
    patternTVC: "Pattern TVC",
    patternTVCDiffusion: "Pattern TVC (Diffusion)",
    blueNoise: "Blue Noise (Softest)",
    blueNoise16: "Blue Noise 16x16 (menej opakujúci sa)",
    blueNoise16Aniso: "Blue Noise 16x16 (optimalizovaný pre 2:1)",
    patternMixScanline: "Riadkové miešanie",
    ttPatternMixScanline: "Pattern TVC mieša dve farby v striedajúcich sa riadkoch namiesto šachovnice. Na 2:1 pixeloch 16-farebného režimu to často pôsobí plynulejšie.",
    ordered8: "Ordered 8x8",
    ordered4: "Ordered 4x4",
    ordered2: "Ordered 2x2",
    bayer16: "Ordered 16x16 (Bayer)",
    sierraLite: "Sierra Lite",
    stucki: "Stucki",
    burkes: "Burkes",
    jarvis: "Jarvis, Judice, Ninke",
    ostromoukhov: "Ostromoukhov (Adaptívny)",
    clusterDot: "Cluster Dot 8x8 (Halftone)",
    threshold: "Prah (Bez vzoru)",
    none: "Žiadne (Posterizovať)",
    composition: "Kompozícia",
    cropFill: "Výplň s orezaním",
    letterbox: "Letterbox",
    stretchFill: "Roztiahnutie",
    zoom: "Priblíženie obrázka",
    hPos: "Horizontálna poloha",
    vPos: "Vertikálna poloha",
    bgFill: "Výplň pozadia",
    adjustments: "Úpravy obrázka",
    reset: "Resetovať",
    autoTune: "Auto Tune",
    autoTuningTitle: "Automatické ladenie...",
    autoTuningDesc: "Testovanie viac ako 700 kombinácií na nájdenie optimálnych nastavení.",
    cancelAutoTune: "Zrušiť",
    brightness: "Jas",
    contrast: "Kontrast",
    saturation: "Sýtosť",
    gamma: "Gamma",
    ditherTuning: "Ladenie ditheringu",
    patternPairMatrix: "Blokovanie párov (Pattern TVC)",
    patternPairMatrixHint: "Kliknutím na bunku zablokujete/povolíte kombinovanie týchto dvoch farieb v šachovnicovom vzore. Kliknutím na diagonálnu bunku (plná farba) túto farbu úplne vylúčite zo všetkých párov.",
    colorBlocklist: "Blokovanie farieb (Yliluoma)",
    colorBlocklistHint: "Kliknutím na farbu ju úplne vylúčiš/obnovíš v miešaní farieb Yliluoma.",
    exportSettingsFilenamePrompt: "Názov súboru:",
    exportSettingsHint: "Uložiť nastavenia do textového súboru (.tvcset) s ľubovoľným názvom",
    importSettingsHint: "Načítať nastavenia z textového súboru .tvcset",
    importSettingsError: "Tento súbor s nastaveniami sa nepodarilo prečítať - môže byť poškodený alebo nejde o platný export.",
    editorBack: "Späť na konvertor",
    editorPencil: "Ceruzka",
    editorLine: "Čiara",
    editorRectangle: "Obdĺžnik",
    editorRectangleFilled: "Vyplnený obdĺžnik",
    editorEllipse: "Elipsa",
    editorFill: "Výplň (vedro)",
    editorThickness: "Hrúbka",
    editorColors: "Farby",
    editorPrimaryColor: "Primárna farba (ľavé kliknutie)",
    editorSecondaryColor: "Sekundárna farba (pravé kliknutie)",
    editorTransparent: "Priehľadná (16. farba)",
    editorGrid: "Pixelová mriežka",
    editorPreview: "Náhľad",
    editorSave: "Uložiť",
    editorSaveBin: "BIN",
    editorSaveBinZx7: "BIN (komprimované ZX7)",
    editorOpen: "Otvoriť",
    editorOpenHint: "Otvoriť súbor BMP, BIN alebo BIN.ZX7 bez konverzie",
    editorPanHint: "Rolovaním priblížiš. Ťahaním stredným tlačidlom (alebo posuvníkmi) posunieš. Ľavé kliknutie = primárna farba, pravé kliknutie = sekundárna farba.",
    editorSizeMismatch: "Obrázok musí mať presne cieľové rozlíšenie.",
    editorEditButton: "Pixelový editor",
    editorOpenBlank16: "Otvoriť prázdny 16-farebný editor (128×240)",
    editorOpenBlank4: "Otvoriť prázdny 4-farebný editor (256×240)",
    editorOpenBlank2: "Otvoriť prázdny 2-farebný editor (512×240)",
    editorOpenBlank256k: "Otvoriť prázdny editor 256k (256×240)",
    editorUnsavedWarning: "Máš neuložené zmeny, ktoré sa stratia, ak sa vrátiš bez uloženia.",
    editorCancel: "Zrušiť",
    editorDiscardAndBack: "Zahodiť a vrátiť sa",
    editorResetWarning: "Týmto sa obrázok vráti do stavu pri otvorení a zahodia sa všetky úpravy. Dá sa to vrátiť späť (Ctrl+Z).",
    editorResetConfirm: "Resetovať",
    editorTransparencyToggle: "Zobraziť/skryť zvýraznenie priehľadnej farby na obrázku",
    editorRecolorSlot: "Zmeniť túto farbu",
    editorCheckerFill: "Šachovnicová výplň: kreslí vzorom z primárnej a sekundárnej farby",
    editorSelect: "Vybrať / presunúť obdĺžnikovú oblasť",
    editorSelectConfirm: "Umiestniť sem (Enter)",
    editorSelectCancel: "Zrušiť presun (Esc)",
    editorFlipH: "Preklopiť vodorovne",
    editorFlipV: "Preklopiť zvisle",
    editorScrollUp: "Posun nahor (obtáča sa)",
    editorScrollDown: "Posun nadol (obtáča sa)",
    editorScrollLeft: "Posun doľava (obtáča sa)",
    editorScrollRight: "Posun doprava (obtáča sa)",
    editorRecolorHint: "Vyber novú farbu pre toto miesto:",
    editorUnrecognizedFile: "Nerozpoznaný alebo nepodporovaný súbor BMP - otvárať sa dajú len vlastné exporty aplikácie (128×240/256×240/512×240 24bpp alebo 256×240 4bpp).",
    editorOpenError: "Súbor sa nepodarilo prečítať.",
    editorBinSizeMismatchTitle: "Veľkosť súboru presne nezodpovedá žiadnemu známemu rozlíšeniu.",
    editorBinSizeMismatchHint: "Veľkosť súboru: {size} bajtov. Vyber, ako ktoré rozlíšenie ho interpretovať (najlepší odhad je predvybraný):",
    editorLoad: "Načítať",
    ditherAmount: "Množstvo difúzie chyby",
    noiseLevel: "Úroveň šumu",
    solidSnap: "Prichytenie k pevným oblastiam",
    sourcePreview: "NÁHĽAD ZDROJA",
    tvcModeLabel: "REŽIM TVC (ROZTIAHNUTIE 2:1)",
    originalModeLabel: "ORIGINÁLNY REŽIM (ROZTIAHNUTIE 2:1)",
    viewScale: "Zobraziť mierku 1:1",
    viewFullscreen: "Celoobrazovkový náhľad",
    noData: "Žiadne dáta",
    dragHelper: "Potiahnutím umiestnite • Posúvaním priblížite",
    downloadBmp: "Uložiť ako BMP",
    downloadBin: "Uložiť ako TVC bin",
    downloadBinZX7: "Uložiť ako TVC bin (ZX7)",
    saveSettings: "Uložiť nastavenia",
    loadSettings: "Načítať nastavenia",
    nativePreview: "Náhľad natívnej veľkosti",
    nativePreviewDescTVC: (mode: string) => mode === 'tvc-2' ? "512 x 240 pixelov (zobrazenie 1:1)" : mode === 'tvc-4' ? "256 x 240 pixelov (zobrazenie 1:1)" : "128 x 240 pixelov (Roztiahnuté na 256 x 240)",
    nativePreviewDescOriginal: (w: number, h: number) => `${w} x ${h} pixelov (Roztiahnuté na ${w*2} x ${h})`,
    closePreview: "Zatvoriť náhľad",
    error: "Chyba",
    footerMode: "REŽIM TVC: 128x240 (ŠIROKÉ PIXELY)",
    footerPalette: "HARDVÉROVÁ PALETA: 15 FARIEB",
    lab: "Generátor obrázkov Videoton TV Computer (TVC) // Lab",
    increase: "Zvýšiť",
    decrease: "Znížiť",
    centerImage: "Stred",
    autoDetect: "Automaticky detegovať najlepšie nastavenia",
    panZoom: "Potiahnutím posúvajte • Posúvaním priblížte zobrazenie",
    headerTitle: "Prevodník obrázkov VIDEOTON TV COMPUTER",
    facebookGroup: "Facebooková skupina",
    ttNew: "Načítať nový obrázok",
    ttSelectImage: "Vyberte obrázok z počítača",
    tt16Colors: "16-farebný režim (rozlíšenie 128x240)",
    tt4Colors: "4-farebný režim (rozlíšenie 256x240)",
    tt2Colors: "2-farebný režim (rozlíšenie 512x240)",
    ttOriginalMode: "Zachovať pôvodné rozlíšenie obrázka.",
    ttFullScreenMode: "Prispôsobiť veľkosť obrázka obrazovke TVC.",
    ttCropFill: "Vyplniť obrázok s orezaním",
    ttLetterbox: "Zobraziť celý obrázok (s čiernymi pruhmi)",
    ttStretchFill: "Roztiahnuť obrázok na celú oblasť",
    ttViewFullscreen: "Zobraziť na celú obrazovku",
    ttViewScale: "Zobraziť pôvodnú veľkosť",
    ttSelectColor: "Vybrať farbu",
    ttClosePreview: "Zavrieť náhľad",
    ttCancelAutoTune: "Zrušiť automatické ladenie",
    ttCenterImage: "Centrovať obrázok",
    ttAutoDetect: "Automaticky detegovať najlepšie nastavenia",
    ttAutoTunePrecision: "Auto 4 (Presnosť): Hodnotenie založené na skutočnej štrukturálnej podobnosti (SSIM) namiesto ručne nastavených násobiteľov",
    ttReset: "Obnoviť nastavenia obrázka na predvolené",
    ttCopyFrom: (mode: string) => `Kopírovať nastavenia z ${mode}`,
    ttDownloadBmp: "Uložiť obrázok v štandardnom formáte BMP",
    ttDownloadBin: "Uložiť obrázok v surovom binárnom formáte TVC",
    saveOriginalSize: "Uložiť pôvodnú veľkosť",
    saveComposition: "Uložiť kompozíciu",
    ttSaveOriginalSize: "Vyberte, či chcete uložiť pôvodné rozmery obrázka alebo kompozíciu prispôsobenú rozlíšeniu TVC.",
    ttDownloadBinZX7: "Uložiť obrázok v binárnom formáte TVC komprimovanom pomocou ZX7",
    ttInvertColors: "Vymeniť dva vybrané farby",
    ttLanguage: "Zmeniť jazyk",
    ttManual: "Používateľská príručka",
    autoCropBorder: "Automatické orezanie okraja",
    ttAutoCropBorder: "Automaticky oreže jednofarebný okraj okolo načítaného obrázka podľa ľavého horného pixelu",
    trimBorderBtn: "Orezať okraj",
    ttTrimBorderBtn: "Odstráni okolitý jednofarebný okraj podľa ľavého horného pixelu",
    selectedColors: "Vybrané farby",
    invertColors: "Invertovať farby",
    denoise: "Redukcia šumu",
    unsharpMask: "Maska doostrenia",
    toneMapping: "Mapovanie tónov",
    advancedSettings: "Rozšírené nastavenia",
    serpentine: "Serpentínové skenovanie",
    perceptualWeighting: "Percepčná farebná vzdialenosť",
    pixelArtCleaning: "Čistenie Pixel Artu",
    resizeQuality: "Plynulé zmenšenie",
    ttResizeQuality: "Gama-korektné zmenšenie s priemerovaním oblasti (čistejšie pri fotografiách, ale pomalšie). Vypnuté: pôvodné, rýchle zmenšenie metódou najbližšieho suseda.",
    autoColorSelection: "Automatický výber farieb (K-Means)",
    preciseAutoColor: "Presná Auto Farba (Lab)",
    ttPreciseAutoColor: "Pri výbere najlepších farieb používa farebnú vzdialenosť CIELAB (percepčne rovnomernú) namiesto obvyklej aproximácie redmean. Ovplyvňuje iba tento jednorazový výber farieb, nie dithering po pixeloch - môže zostať pokojne zapnuté.",
    ttDenoise: "Redukuje digitálny šum pred zmenou veľkosti.",
    ttUnsharpMask: "Zvýrazňuje hrany na zachovanie dôležitých detailov.",
    ttToneMapping: "Komprimuje dynamický rozsah na zachovanie detailov v tmavých/svetlých oblastiach.",
    ttSerpentine: "Striedavý smer skenovania na zlepšenie vzorov ditheringu.",
    ttPerceptualWeighting: "Porovnávanie farieb prispôsobené citlivosti ľudského oka.",
    ttPixelArtCleaning: "Odstraňuje izolované pixelové body pre čistejší obraz.",
    ttAutoColorSelection: "Algoritmus K-Means na výber najlepších farieb pre 4- a 2-farebné režimy.",
    generateMask: "Priehľadné pozadie",
    ttGenerateMask: "Zmeniť vonkajšie jednofarebné pozadie na priehľadné (kód 1000)",
    clearMask: "Zmazať masku",
    ttClearMask: "Odstrániť masku priehľadnosti",
    maskVisibility: "Priehľadnosť",
    ttMaskVisibility: "Zapnúť/vypnúť zvýraznenie priehľadnosti na obrazovke",
    maskActiveBadge: "Maska aktívna",
    colorNames: [
      "Čierna", "Tmavomodrá", "Tmavá červená", "Tmavofialová", 
      "Modrá", "Červená", "Fialová", "Tmavozelená", 
      "Tmavá azúrová", "Tmavá žltá", "Sivá", "Zelená", 
      "Azúrová", "Žltá", "Biela"
    ]
  },
  ro: {
    title: "Creator de imagini Videoton TV Computer (TVC)",
    new: "Nou",
    introTitle: "Creator de imagini<br/>Videoton TV Computer (TVC)",
    introDesc: "Convertiți orice imagine în modul clasic cu 16, 4 sau 2 culori. Mapare anamorfică a pixelilor pentru rezultate autentice de afișare pe hardware.",
    selectImage: "Selectați imaginea sau trageți și plasați",
    autoConversion: "Conversie automată a culorilor",
    outputRes: "Rezoluție de ieșire",
    tvcMode: "TVC (128x240)",
    tvc16Mode: "16 Culori",
    tvc4Mode: "4 Culori",
    tvc2Mode: "2 Culori",
    originalMode: "Dimensiune originală",
    fullScreenMode: "Ecran complet TVC",
    ditherMethod: "Metodă de dithering",
    catModernist: "Modernist",
    catOrdered: "Ordered (Classic)",
    catDiffusion: "Diffusion",
    patternTVC: "Pattern TVC",
    patternTVCDiffusion: "Pattern TVC (Diffusion)",
    blueNoise: "Blue Noise (Softest)",
    blueNoise16: "Blue Noise 16x16 (mai puțin repetitiv)",
    blueNoise16Aniso: "Blue Noise 16x16 (optimizat pentru 2:1)",
    patternMixScanline: "Amestec pe linii",
    ttPatternMixScanline: "Pattern TVC amestecă cele două culori în rânduri alternative în loc de tablă de șah. Pe pixelii 2:1 ai modului cu 16 culori acest lucru se îmbină adesea mai lin.",
    ordered8: "Ordered 8x8",
    ordered4: "Ordered 4x4",
    ordered2: "Ordered 2x2",
    bayer16: "Ordered 16x16 (Bayer)",
    sierraLite: "Sierra Lite",
    stucki: "Stucki",
    burkes: "Burkes",
    jarvis: "Jarvis, Judice, Ninke",
    ostromoukhov: "Ostromoukhov (Adaptiv)",
    clusterDot: "Cluster Dot 8x8 (Halftone)",
    threshold: "Prag (Fără model)",
    none: "Niciunul (Posterizare)",
    composition: "Compoziție",
    cropFill: "Umplere prin tăiere",
    letterbox: "Letterbox",
    stretchFill: "Întindere",
    zoom: "Zoom imagine",
    hPos: "Poziție orizontală",
    vPos: "Poziție verticală",
    bgFill: "Umplere fundal",
    adjustments: "Ajustări imagine",
    reset: "Resetare",
    autoTune: "Auto Tune",
    autoTuningTitle: "Reglare automată...",
    autoTuningDesc: "Testarea a peste 700 de combinații pentru a găsi setările optime.",
    cancelAutoTune: "Anulare",
    brightness: "Luminozitate",
    contrast: "Contrast",
    saturation: "Saturație",
    gamma: "Gamma",
    ditherTuning: "Reglaj dithering",
    patternPairMatrix: "Blocare perechi (Pattern TVC)",
    patternPairMatrixHint: "Apasă pe o celulă pentru a bloca/permite amestecul în tablă de șah al acelor două culori. Apăsând pe o celulă de pe diagonală (culoare solidă) excluzi complet acea culoare din toate perechile.",
    colorBlocklist: "Blocare culori (Yliluoma)",
    colorBlocklistHint: "Apasă pe o culoare pentru a o exclude/restabili complet din amestecul de culori Yliluoma.",
    exportSettingsFilenamePrompt: "Nume fișier:",
    exportSettingsHint: "Salvează setările într-un fișier text (.tvcset) cu numele ales de tine",
    importSettingsHint: "Încarcă setările dintr-un fișier text .tvcset",
    importSettingsError: "Acest fișier de setări nu a putut fi citit - poate fi corupt sau nu este un export valid.",
    editorBack: "Înapoi la convertor",
    editorPencil: "Creion",
    editorLine: "Linie",
    editorRectangle: "Dreptunghi",
    editorRectangleFilled: "Dreptunghi plin",
    editorEllipse: "Elipsă",
    editorFill: "Umplere (găleată)",
    editorThickness: "Grosime",
    editorColors: "Culori",
    editorPrimaryColor: "Culoare primară (clic stânga)",
    editorSecondaryColor: "Culoare secundară (clic dreapta)",
    editorTransparent: "Transparent (a 16-a culoare)",
    editorGrid: "Grilă de pixeli",
    editorPreview: "Previzualizare",
    editorSave: "Salvează",
    editorSaveBin: "BIN",
    editorSaveBinZx7: "BIN (comprimat ZX7)",
    editorOpen: "Deschide",
    editorOpenHint: "Deschide un fișier BMP, BIN sau BIN.ZX7, fără conversie",
    editorPanHint: "Derulează pentru a mări. Trage cu butonul din mijloc (sau barele de derulare) pentru a muta. Clic stânga = culoare primară, clic dreapta = culoare secundară.",
    editorSizeMismatch: "Imaginea trebuie să aibă exact rezoluția țintă.",
    editorEditButton: "Editor de pixeli",
    editorOpenBlank16: "Deschide editor gol cu 16 culori (128×240)",
    editorOpenBlank4: "Deschide editor gol cu 4 culori (256×240)",
    editorOpenBlank2: "Deschide editor gol cu 2 culori (512×240)",
    editorOpenBlank256k: "Deschide editor gol 256k (256×240)",
    editorUnsavedWarning: "Ai modificări nesalvate care se vor pierde dacă te întorci fără să salvezi.",
    editorCancel: "Anulează",
    editorDiscardAndBack: "Renunță și întoarce-te",
    editorResetWarning: "Aceasta va reseta imaginea la starea de la deschidere, renunțând la toate modificările. Poate fi anulat (Ctrl+Z).",
    editorResetConfirm: "Resetare",
    editorTransparencyToggle: "Afișează/ascunde evidențierea culorii transparente pe imagine",
    editorRecolorSlot: "Schimbă această culoare",
    editorCheckerFill: "Umplere în tablă de șah: desenează cu culoarea primară și secundară în model de pătrate",
    editorSelect: "Selectare / mutare a unei zone dreptunghiulare",
    editorSelectConfirm: "Plasează aici (Enter)",
    editorSelectCancel: "Anulează mutarea (Esc)",
    editorFlipH: "Oglindire orizontală",
    editorFlipV: "Oglindire verticală",
    editorScrollUp: "Derulare în sus (se reia circular)",
    editorScrollDown: "Derulare în jos (se reia circular)",
    editorScrollLeft: "Derulare la stânga (se reia circular)",
    editorScrollRight: "Derulare la dreapta (se reia circular)",
    editorRecolorHint: "Alege o culoare nouă pentru acest loc:",
    editorUnrecognizedFile: "Fișier BMP nerecunoscut sau neacceptat - se pot deschide doar exporturile proprii ale aplicației (128×240/256×240/512×240 24bpp sau 256×240 4bpp).",
    editorOpenError: "Fișierul nu a putut fi citit.",
    editorBinSizeMismatchTitle: "Dimensiunea fișierului nu corespunde exact niciunei rezoluții cunoscute.",
    editorBinSizeMismatchHint: "Dimensiune fișier: {size} octeți. Alege ca ce rezoluție să fie interpretat (cea mai bună presupunere e preselectată):",
    editorLoad: "Încarcă",
    ditherAmount: "Cantitate difuzie eroare",
    noiseLevel: "Nivel de zgomot",
    solidSnap: "Snap zonă solidă",
    sourcePreview: "PREVIZUALIZARE SURSĂ",
    tvcModeLabel: "MOD TVC (ÎNTINDERE 2:1)",
    originalModeLabel: "MOD ORIGINAL (ÎNTINDERE 2:1)",
    viewScale: "Vizualizare scară 1:1",
    viewFullscreen: "Previzualizare ecran complet",
    noData: "Nicio dată",
    dragHelper: "Trageți pentru poziționare • Derulați pentru zoom",
    downloadBmp: "Salvați ca BMP",
    downloadBin: "Salvați ca TVC bin",
    downloadBinZX7: "Salvați ca TVC bin (ZX7)",
    saveSettings: "Salvați setările",
    loadSettings: "Încărcați setările",
    nativePreview: "Previzualizare dimensiune nativă",
    nativePreviewDescTVC: (mode: string) => mode === 'tvc-2' ? "512 x 240 pixeli (afișaj 1:1)" : mode === 'tvc-4' ? "256 x 240 pixeli (afișaj 1:1)" : "128 x 240 pixeli (Întins la 256 x 240)",
    nativePreviewDescOriginal: (w: number, h: number) => `${w} x ${h} pixeli (Întins la ${w*2} x ${h})`,
    closePreview: "Închideți previzualizarea",
    error: "Eroare",
    footerMode: "MOD TVC: 128x240 (PIXELI LAȚI)",
    footerPalette: "PALETĂ HARDWARE: 15 CULORI",
    lab: "Creator de imagini Videoton TV Computer (TVC) // Lab",
    increase: "Crește",
    decrease: "Scade",
    centerImage: "Centru",
    autoDetect: "Detectare automată a celor mai bune setări",
    panZoom: "Trageți pentru panoramare • Derulați pentru zoom",
    headerTitle: "Convertor de imagini VIDEOTON TV COMPUTER",
    facebookGroup: "Grup de Facebook",
    ttNew: "Încărcați o imagine nouă",
    ttSelectImage: "Selectați o imagine din computerul dvs.",
    tt16Colors: "Modul 16 culori (rezoluție 128x240)",
    tt4Colors: "Modul 4 culori (rezoluție 256x240)",
    tt2Colors: "Modul 2 culori (rezoluție 512x240)",
    ttOriginalMode: "Păstrați rezoluția originală a imaginii.",
    ttFullScreenMode: "Reglați dimensiunea imaginii la ecranul TVC.",
    ttCropFill: "Umpleți imaginea cu decupare",
    ttLetterbox: "Afișați imaginea completă (cu bare negre)",
    ttStretchFill: "Întindeți imaginea pentru a umple zona",
    ttViewFullscreen: "Vizualizare pe ecran complet",
    ttViewScale: "Vizualizați dimensiunea originală",
    ttSelectColor: "Selectați culoarea",
    ttClosePreview: "Închideți previzualizarea",
    ttCancelAutoTune: "Anulați reglarea automată",
    ttCenterImage: "Centrați imaginea",
    ttAutoDetect: "Detectare automată a celor mai bune setări",
    ttAutoTunePrecision: "Auto 4 (Precizie): Evaluare bazată pe similitudine structurală reală (SSIM) în loc de multiplicatori reglați manual",
    ttReset: "Resetați setările imaginii la valorile implicite",
    ttCopyFrom: (mode: string) => `Copiați setările din ${mode}`,
    ttDownloadBmp: "Salvați imaginea în format BMP standard",
    ttDownloadBmp11: "Salvați imaginea ca BMP cu raport 1:1 (128x240)",
    ttDownloadBmp21: "Salvați imaginea ca BMP cu raport 2:1 (256x240)",
    ttDownloadBin: "Salvați imaginea în format binar TVC brut",
    ttDownloadBinZX7: "Salvați imaginea în format binar TVC comprimat cu ZX7",
    saveOriginalSize: "Salvați dimensiunea originală",
    saveComposition: "Salvați compoziția",
    ttSaveOriginalSize: "Alegeți dacă doriți să salvați dimensiunile originale ale imaginii sau compoziția ajustată la rezoluția TVC.",
    ttSaveOriginalSizeBtn: "Salvați imaginea completă la rezoluția originală folosind paleta TVC.",
    ttSaveCompositionBtn: "Salvați compoziția curentă (zoom/pan) la o rezoluție fixă TVC.",
    ttInvertColors: "Inversați cele două culori selectate",
    ttLanguage: "Schimbați limba",
    ttManual: "Manual de utilizare",
    autoCropBorder: "Decupare automată chenar",
    ttAutoCropBorder: "Decupează automat chenarul de culoare unică pe baza pixelului din stânga sus",
    trimBorderBtn: "Decupează chenar",
    ttTrimBorderBtn: "Elimină chenarul de culoare unică pe baza pixelului din stânga sus",
    selectedColors: "Culori selectate",
    invertColors: "Inversare culori",
    denoise: "Reducerea zgomotului",
    unsharpMask: "Mască de claritate",
    toneMapping: "Mapare tonuri",
    advancedSettings: "Setări avansate",
    serpentine: "Scanare serpentină",
    perceptualWeighting: "Distanță de culoare perceptivă",
    pixelArtCleaning: "Curățare Pixel Art",
    resizeQuality: "Redimensionare fină",
    ttResizeQuality: "Redimensionare cu corecție gamma și mediere pe zonă (mai curată pentru fotografii, dar mai lentă). Dezactivat: redimensionarea originală, rapidă, prin cel mai apropiat vecin.",
    autoColorSelection: "Selecție automată a culorilor (K-Means)",
    preciseAutoColor: "Culoare Automată Precisă (Lab)",
    ttPreciseAutoColor: "Folosește distanța de culoare CIELAB (perceptual uniformă) în loc de aproximarea redmean obișnuită la alegerea celor mai bune culori. Afectează doar această selecție unică de culoare, nu ditheringul per pixel - poate fi lăsată activată în siguranță.",
    ttDenoise: "Reduce zgomotul digital înainte de redimensionare.",
    ttUnsharpMask: "Îmbunătățește marginile pentru a păstra detaliile importante.",
    ttToneMapping: "Comprimă intervalul dinamic pentru a păstra detaliile în zonele întunecate/luminoase.",
    ttSerpentine: "Direcție de scanare alternativă pentru a îmbunătăți modelele de dithering.",
    ttPerceptualWeighting: "Comparație de culori ajustată la sensibilitatea ochiului uman.",
    ttPixelArtCleaning: "Elimină punctele de pixeli izolate pentru o imagine mai curată.",
    ttAutoColorSelection: "Algoritm K-Means pentru a selecta cele mai bune culori pentru modurile cu 4 și 2 culori.",
    generateMask: "Fundal transparent",
    ttGenerateMask: "Faceți fundalul exterior uniform transparent (cod 1000)",
    clearMask: "Șterge masca",
    ttClearMask: "Eliminați masca de transparență",
    maskVisibility: "Transparență",
    ttMaskVisibility: "Comutați evidențierea transparenței pe ecran",
    maskActiveBadge: "Mască activă",
    colorNames: [
      "Negru", "Albastru închis", "Roșu închis", "Violet închis", 
      "Albastru", "Roșu", "Violet", "Verde închis", 
      "Cyan închis", "Galben închis", "Gri", "Verde", 
      "Cyan", "Galben", "Alb"
    ]
  }
};

type Language = 'hu' | 'en' | 'pl' | 'de' | 'ru' | 'uk' | 'es' | 'sk' | 'ro';

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
  
  // Dragging state for Composition (TVC mode)
  const [isDragging, setIsDragging] = useState(false);
  const resultContainerRef = useRef<HTMLDivElement | null>(null);

  const preventDefaultWheel = React.useCallback((e: WheelEvent) => {
    e.preventDefault();
  }, []);

  const resultContainerCallbackRef = React.useCallback((node: HTMLDivElement | null) => {
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
      // In Original Mode with saveOriginalSize=false, use 'tvc' resolution mode for composition
      const isSavingComposition = currentSettings.resolutionMode === 'original' && !currentSettings.saveOriginalSize;
      const effectiveResolutionMode = isSavingComposition ? 'tvc' : currentSettings.resolutionMode;
      const effectiveFitMode = (currentSettings.resolutionMode === 'original' && currentSettings.saveOriginalSize) ? 'stretch' : currentSettings.fitMode;

      let paletteToUse = currentSettings.selectedColors 
        ? currentSettings.selectedColors.map(i => FIXED_PALETTE[i])
        : FIXED_PALETTE;

      let selectedColorsToUse = currentSettings.selectedColors;

      const result = await processImage(
        img, 
        paletteToUse, 
        effectiveFitMode, 
        currentSettings.ditherMethod,
        currentSettings.adjustments,
        currentSettings.positionX,
        currentSettings.positionY,
        currentSettings.zoom,
        currentSettings.backgroundColor,
        currentSettings.outputMode,
        effectiveResolutionMode,
        currentSettings.invertColors,
        undefined,
        currentSettings.serpentine,
        currentSettings.perceptualWeighting,
        currentSettings.pixelArtCleaning,
        currentSettings.autoColorSelection,
        currentSettings.disabledPatternPairs ?? [],
        currentSettings.resizeQuality ?? 'sharp',
        currentSettings.preciseAutoColor ?? false,
        currentSettings.patternMixMode ?? 'checker'
      );

      // Map indices back to the full 15-color palette if a subset was used
      let finalIndices = result.indices;
      if (selectedColorsToUse) {
        finalIndices = new Uint8Array(result.indices.length);
        for (let i = 0; i < result.indices.length; i++) {
          finalIndices[i] = selectedColorsToUse[result.indices[i]];
        }
      }

      // Width/Height here are "raw" pixel dimensions
      let rawWidth = Math.ceil(img.width / (currentSettings.outputMode === 'tvc-16' ? 2 : 1));
      let rawHeight = img.height;
      
      if (effectiveResolutionMode === 'tvc256k') {
        rawWidth = 256;
        rawHeight = 240;
      } else if (effectiveResolutionMode === 'tvc') {
        if (currentSettings.outputMode === 'tvc-16') {
          rawWidth = 128;
          rawHeight = 240;
        } else if (currentSettings.outputMode === 'tvc-4') {
          rawWidth = 256;
          rawHeight = 240;
        } else if (currentSettings.outputMode === 'tvc-2') {
          rawWidth = 512;
          rawHeight = 240;
        }
      }

      setTransparencyMask(null);
      setMaskedPreviewUrl(null);
      setPixelData({
        originalUrl: img.src,
        processedUrl: result.url,
        indices: finalIndices,
        rgba: result.rgba,
        palette: FIXED_PALETTE,
        width: rawWidth,
        height: rawHeight
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
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = finalName;
      link.click();
      URL.revokeObjectURL(link.href);
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

      const { adjustments, ditherMethod, selectedColors } = await findBestSettings(
        sourceImage,
        settings.outputMode,
        settings.selectedColors,
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
      if (error instanceof Error && error.message === 'Auto-tune aborted') {
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
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = generateEditorFilename('bmp', editorConfig, ratio);
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleEditorSaveBIN = (indices: Uint8Array, mask: Uint8Array, activeColors?: number[]) => {
    if (!editorConfig) return;
    const buffer = encodeEditorBin(editorConfig.width, editorConfig.height, indices, mask, editorConfig.mode, activeColors ?? editorConfig.activeColors);
    const blob = new Blob([buffer as any], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = generateEditorFilename('bin', editorConfig);
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleEditorSaveBINZX7 = (indices: Uint8Array, mask: Uint8Array, activeColors?: number[]) => {
    if (!editorConfig) return;
    const buffer = encodeEditorBin(editorConfig.width, editorConfig.height, indices, mask, editorConfig.mode, activeColors ?? editorConfig.activeColors);
    const compressed = compressZX7(buffer);
    const blob = new Blob([compressed as any], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = generateEditorFilename('bin.zx7', editorConfig);
    link.click();
    URL.revokeObjectURL(link.href);
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

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = generateFilename('bmp', ratio);
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const getBinData = (data: PixelData | null): Uint8Array | null => {
    if (!data) return null;
    
    const width = data.width;
    const height = data.height;
    const indices = data.indices;

    let stride = Math.ceil(width / 2);
    if (settings.resolutionMode !== 'tvc256k') {
      if (settings.outputMode === 'tvc-4') stride = Math.ceil(width / 4);
      if (settings.outputMode === 'tvc-2') stride = Math.ceil(width / 8);
    }

    const binSize = stride * height;
    const buffer = new Uint8Array(binSize);
    
    let bufIdx = 0;
    for (let y = 0; y < height; y++) {
      if (settings.resolutionMode === 'tvc256k') {
        for (let x = 0; x < width; x += 2) {
          const p1Idx = y * width + x;
          const p2Idx = y * width + x + 1;

          const isMasked1 = transparencyMask ? (transparencyMask[p1Idx] === 1) : false;
          const isMasked2 = transparencyMask ? (x + 1 < width && transparencyMask[p2Idx] === 1) : false;

          const c1 = isMasked1 ? 8 : (TVC_PALETTE_MAP_256K[indices[p1Idx]] ?? 0);
          const c2 = isMasked2 ? 8 : ((x + 1 < width) ? (TVC_PALETTE_MAP_256K[indices[p2Idx]] ?? 0) : 0);

          // 1 point (x) upper 4 bits, 1 point (x+1) lower 4 bits (IRGB 08.bmp standard)
          const byte = ((c1 & 0x0F) << 4) | (c2 & 0x0F);
          buffer[bufIdx++] = byte;
        }
      } else if (settings.outputMode === 'tvc-16') {
        for (let x = 0; x < width; x += 2) {
          const idx1 = indices[y * width + x];
          const idx2 = (x + 1 < width) ? indices[y * width + x + 1] : 0;

          const c1 = TVC_PALETTE_MAP[idx1];
          const c2 = TVC_PALETTE_MAP[idx2];

          const i1 = (c1 >> 3) & 1;
          const g1 = (c1 >> 2) & 1;
          const r1 = (c1 >> 1) & 1;
          const b1 = (c1 >> 0) & 1;

          const i2 = (c2 >> 3) & 1;
          const g2 = (c2 >> 2) & 1;
          const r2 = (c2 >> 1) & 1;
          const b2 = (c2 >> 0) & 1;

          const byte = (i1 << 7) | (i2 << 6) | (g1 << 5) | (g2 << 4) | (r1 << 3) | (r2 << 2) | (b1 << 1) | (b2 << 0);
          buffer[bufIdx++] = byte;
        }
      } else if (settings.outputMode === 'tvc-4') {
        for (let x = 0; x < width; x += 4) {
          const getVal = (offset: number) => {
            if (x + offset >= width) return 0;
            const globalIdx = indices[y * width + x + offset];
            const localIdx = settings.selectedColors ? settings.selectedColors.indexOf(globalIdx) : -1;
            if (localIdx === -1) {
              console.warn(`[BinExport] Warning: Pixel index ${globalIdx} is missing from selectedColors! Fallback to 0.`);
            }
            return Math.max(0, localIdx);
          };
          const v1 = getVal(0);
          const v2 = getVal(1);
          const v3 = getVal(2);
          const v4 = getVal(3);

          const v1_c0 = v1 & 1; const v1_c1 = (v1 >> 1) & 1;
          const v2_c0 = v2 & 1; const v2_c1 = (v2 >> 1) & 1;
          const v3_c0 = v3 & 1; const v3_c1 = (v3 >> 1) & 1;
          const v4_c0 = v4 & 1; const v4_c1 = (v4 >> 1) & 1;

          const byte = (v1_c0 << 7) | (v2_c0 << 6) | (v3_c0 << 5) | (v4_c0 << 4) | (v1_c1 << 3) | (v2_c1 << 2) | (v3_c1 << 1) | (v4_c1 << 0);
          buffer[bufIdx++] = byte;
        }
      } else if (settings.outputMode === 'tvc-2') {
        for (let x = 0; x < width; x += 8) {
          const getVal = (offset: number) => {
            if (x + offset >= width) return 0;
            const globalIdx = indices[y * width + x + offset];
            const localIdx = settings.selectedColors ? settings.selectedColors.indexOf(globalIdx) : -1;
            if (localIdx === -1) {
              console.warn(`[BinExport] Warning: Pixel index ${globalIdx} is missing from selectedColors! Fallback to 0.`);
            }
            return Math.max(0, localIdx);
          };
          const v1 = getVal(0) & 1;
          const v2 = getVal(1) & 1;
          const v3 = getVal(2) & 1;
          const v4 = getVal(3) & 1;
          const v5 = getVal(4) & 1;
          const v6 = getVal(5) & 1;
          const v7 = getVal(6) & 1;
          const v8 = getVal(7) & 1;

          const byte = (v1 << 7) | (v2 << 6) | (v3 << 5) | (v4 << 4) | (v5 << 3) | (v6 << 2) | (v7 << 1) | (v8 << 0);
          buffer[bufIdx++] = byte;
        }
      }
    }
    return buffer;
  }

  const downloadBin = async () => {
    const dataToSave = await getProcessedDataForSaving();
    const buffer = getBinData(dataToSave);
    if (!buffer) return;

    const blob = new Blob([buffer as any], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = generateFilename('bin');
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadBinZX7 = async () => {
    const dataToSave = await getProcessedDataForSaving();
    const buffer = getBinData(dataToSave);
    if (!buffer) return;

    const compressed = compressZX7(buffer);
    const blob = new Blob([compressed as any], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = generateFilename('bin.zx7');
    link.click();
    URL.revokeObjectURL(link.href);
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
          load: t.editorLoad
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
      <header className="border-b border-slate-800/60 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-11 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-6 bg-blue-600 rounded flex items-center justify-center font-bold text-sm mono italic shadow-md shadow-blue-500/20">
              TVC
            </div>
            <h1 className="text-sm md:text-base font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              {t.headerTitle} <span className="text-[10px] font-mono text-blue-500/80 ml-1">V4.3</span>
            </h1>
          </div>
          <div className="flex items-center space-x-3">
            <div className="relative flex items-center bg-slate-900 border border-slate-700/70 rounded-lg px-2 py-1 text-slate-200 hover:text-white transition-colors focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500/50 shadow-sm">
              <Languages size={14} className="text-blue-400 mr-1.5 flex-shrink-0" />
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as Language)}
                className="bg-slate-900 text-slate-200 font-bold text-[11px] font-mono uppercase focus:outline-none cursor-pointer pr-1 py-0.5 appearance-none"
                title={t.ttLanguage}
              >
                <option value="hu" className="bg-slate-900 text-slate-100 font-semibold">HU</option>
                <option value="en" className="bg-slate-900 text-slate-100 font-semibold">EN</option>
                <option value="pl" className="bg-slate-900 text-slate-100 font-semibold">PL</option>
                <option value="de" className="bg-slate-900 text-slate-100 font-semibold">DE</option>
                <option value="ru" className="bg-slate-900 text-slate-100 font-semibold">RU</option>
                <option value="uk" className="bg-slate-900 text-slate-100 font-semibold">UK</option>
                <option value="es" className="bg-slate-900 text-slate-100 font-semibold">ES</option>
                <option value="sk" className="bg-slate-900 text-slate-100 font-semibold">SK</option>
                <option value="ro" className="bg-slate-900 text-slate-100 font-semibold">RO</option>
              </select>
              <ChevronDown size={10} className="text-slate-400 pointer-events-none ml-0.5 flex-shrink-0" />
            </div>
            <button 
              onClick={() => setShowManual(true)}
              className="p-1.5 rounded-full hover:bg-slate-800 transition-colors text-slate-400 hover:text-white flex items-center gap-1.5 text-xs font-mono border border-transparent hover:border-slate-700"
              title={t.ttManual}
            >
              <HelpCircle size={16} />
            </button>
            {(state === ProcessingState.COMPLETED || state === ProcessingState.ERROR) && (
              <Button onClick={reset} variant="ghost" className="text-xs py-1 px-2.5" title={t.ttNew}>
                {t.new}
              </Button>
            )}
          </div>
        </div>
      </header>

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

                  <ControlGroup title={t.ditherMethod} icon={<Zap size={14} className="text-yellow-500" />} className="space-y-3" contentClassName="space-y-2">
                    <div className="grid grid-cols-1 gap-2">
                      <select 
                        value={settings.ditherMethod}
                        onChange={(e) => handleSettingChange({ ditherMethod: e.target.value as DitherMethod })}
                        className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg p-2 text-sm focus:outline-none focus:border-blue-500 mono"
                      >
                      <option value="pattern-tvc">{t.patternTVC}</option>
                      <option value="pattern-tvc-diffusion">{t.patternTVCDiffusion}</option>
                      <optgroup label={t.catModernist} className="bg-slate-900 text-slate-400">
                        <option value="blue-noise">{t.blueNoise}</option>
                        <option value="blue-noise-16x16">{t.blueNoise16 || 'Blue Noise 16x16'}</option>
                        <option value="blue-noise-16x16-aniso">{t.blueNoise16Aniso || 'Blue Noise 16x16 (2:1 optimized)'}</option>
                        <option value="yliluoma">Yliluoma</option>
                      </optgroup>
                      <optgroup label={t.catOrdered} className="bg-slate-900 text-slate-400">
                        <option value="cluster-dot-8x8">{t.clusterDot}</option>
                        <option value="bayer-16x16">{t.bayer16}</option>
                        <option value="ordered-8x8">{t.ordered8}</option>
                        <option value="ordered-4x4">{t.ordered4}</option>
                        <option value="ordered-2x2">{t.ordered2}</option>
                        <option value="threshold">{t.threshold}</option>
                        <option value="none">{t.none}</option>
                      </optgroup>
                      <optgroup label={t.catDiffusion} className="bg-slate-900 text-slate-400">
                        <option value="floyd-steinberg">Floyd-Steinberg</option>
                        <option value="atkinson">Atkinson</option>
                        <option value="sierra-lite">{t.sierraLite}</option>
                        <option value="stucki">{t.stucki}</option>
                        <option value="burkes">{t.burkes}</option>
                        <option value="jarvis">{t.jarvis}</option>
                        <option value="ostromoukhov">{t.ostromoukhov || 'Ostromoukhov'}</option>
                      </optgroup>
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
                    <img 
                      src={originalBase64} 
                      alt="Adjusted" 
                      className="w-full h-full object-contain"
                      style={{
                        filter: `brightness(${1 + settings.adjustments.brightness/100}) contrast(${1 + settings.adjustments.contrast/100}) saturate(${settings.adjustments.saturation}%)`
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
                     <div className="grid gap-2 shrink-0 grid-cols-1">
                         {settings.outputMode === 'tvc-16' && settings.resolutionMode !== 'tvc256k' ? (
                           <>
                             <Button onClick={() => downloadBMP(1)} icon={<ImageIcon size={14} />} className="w-full py-1 text-xs" isLoading={state === ProcessingState.PROCESSING} title={t.ttDownloadBmp11 || t.ttDownloadBmp}>
                               {t.downloadBmp} (1:1)
                             </Button>
                             <Button onClick={() => downloadBMP(2)} icon={<ImageIcon size={14} />} className="w-full py-1 text-xs" isLoading={state === ProcessingState.PROCESSING} title={t.ttDownloadBmp21 || t.ttDownloadBmp}>
                               {t.downloadBmp} (2:1)
                             </Button>
                           </>
                          ) : (
                            <Button onClick={() => downloadBMP(1)} icon={<ImageIcon size={14} />} className="w-full py-1 text-xs" isLoading={state === ProcessingState.PROCESSING} title={t.ttDownloadBmp}>
                              {t.downloadBmp}
                            </Button>
                          )}
                          <Button onClick={downloadBin} icon={<FileCode size={14} />} className="w-full py-1 text-xs" disabled={state === ProcessingState.PROCESSING} title={t.ttDownloadBin}>
                            {t.downloadBin}
                          </Button>
                          <Button onClick={downloadBinZX7} icon={<FileCode size={14} />} className="w-full py-1 text-xs" disabled={state === ProcessingState.PROCESSING} title={t.ttDownloadBinZX7}>
                            {t.downloadBinZX7}
                          </Button>
                      </div>
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

              <div className="mt-8 grid gap-2 w-full max-w-md grid-cols-1">
                         {settings.outputMode === 'tvc-16' && settings.resolutionMode !== 'tvc256k' ? (
                           <>
                             <Button onClick={() => downloadBMP(1)} icon={<ImageIcon size={14} />} className="w-full py-1 text-xs" isLoading={state === ProcessingState.PROCESSING} title={t.ttDownloadBmp11 || t.ttDownloadBmp}>
                               {t.downloadBmp} (1:1)
                             </Button>
                             <Button onClick={() => downloadBMP(2)} icon={<ImageIcon size={14} />} className="w-full py-1 text-xs" isLoading={state === ProcessingState.PROCESSING} title={t.ttDownloadBmp21 || t.ttDownloadBmp}>
                               {t.downloadBmp} (2:1)
                             </Button>
                           </>
                         ) : (
                           <Button onClick={() => downloadBMP(1)} icon={<ImageIcon size={14} />} className="w-full py-1 text-xs" isLoading={state === ProcessingState.PROCESSING} title={t.ttDownloadBmp}>
                             {t.downloadBmp}
                           </Button>
                         )}
                <Button onClick={downloadBin} icon={<FileCode size={14} />} className="w-full py-1 text-xs" title={t.ttDownloadBin}>
                  {t.downloadBin}
                </Button>
                <Button onClick={downloadBinZX7} icon={<FileCode size={14} />} className="w-full py-1 text-xs" title={t.ttDownloadBinZX7}>
                  {t.downloadBinZX7}
                </Button>
              </div>
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

        {showManual && (
          <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
            <div className="relative bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl flex flex-col max-w-4xl w-full max-h-[95vh] overflow-hidden">
              <button 
                onClick={() => setShowManual(false)}
                className="absolute top-4 right-4 w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center text-white shadow-xl transition-all z-10"
                title={t.ttClosePreview}
              >
                <X size={20} />
              </button>
              <div className="overflow-y-auto custom-scrollbar pr-4 pb-4 prose prose-invert prose-slate max-w-none">
                <Markdown>{lang === 'hu' ? huManual : enManual}</Markdown>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-auto border-t border-slate-800/60 py-8 bg-slate-900/30">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-center gap-8 text-slate-500 text-xs font-mono">
          <a href="http://tvc.homeserver.hu" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
            tvc.homeserver.hu
          </a>
          <a href="https://www.facebook.com/groups/videotontvcomputer" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors flex items-center gap-2">
            <Facebook size={14} className="text-blue-500" />
            {t.facebookGroup}
          </a>
        </div>
      </footer>

      {/* Auto-Tuning Modal */}
      {isAutoTuning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center">
            <Wand2 className="w-12 h-12 text-blue-500 mb-4 animate-pulse" />
            <h3 className="text-xl font-bold text-white mb-2">{t.autoTuningTitle}</h3>
            <p className="text-slate-400 text-sm mb-6">{t.autoTuningDesc}</p>
            
            <div className="w-full bg-slate-800 rounded-full h-2 mb-6 overflow-hidden">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.round(autoTuneProgress * 100)}%` }}
              ></div>
            </div>
            
            <button 
              onClick={cancelAutoTune}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors border border-slate-700"
              title={t.ttCancelAutoTune}
            >
              {t.cancelAutoTune}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
