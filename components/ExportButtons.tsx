import React from 'react';
import { Image as ImageIcon, FileCode } from 'lucide-react';
import Button from './Button';
import type { Translation } from '../i18n';

interface ExportButtonsProps {
  t: Translation;
  className: string;
  // Plain 16-colour mode offers both 1:1 and pre-doubled 2:1 BMPs.
  offerBothBmpRatios: boolean;
  isProcessing: boolean;
  disableBinWhileProcessing?: boolean;
  onDownloadBmp: (ratio: number) => void;
  onDownloadBin: () => void;
  onDownloadZx7: () => void;
}

const ExportButtons: React.FC<ExportButtonsProps> = ({
  t, className, offerBothBmpRatios, isProcessing, disableBinWhileProcessing = false,
  onDownloadBmp, onDownloadBin, onDownloadZx7,
}) => (
  <div className={className}>
    {offerBothBmpRatios ? (
      <>
        <Button onClick={() => onDownloadBmp(1)} icon={<ImageIcon size={14} />} className="w-full py-1 text-xs" isLoading={isProcessing} title={t.ttDownloadBmp11 || t.ttDownloadBmp}>
          {t.downloadBmp} (1:1)
        </Button>
        <Button onClick={() => onDownloadBmp(2)} icon={<ImageIcon size={14} />} className="w-full py-1 text-xs" isLoading={isProcessing} title={t.ttDownloadBmp21 || t.ttDownloadBmp}>
          {t.downloadBmp} (2:1)
        </Button>
      </>
    ) : (
      <Button onClick={() => onDownloadBmp(1)} icon={<ImageIcon size={14} />} className="w-full py-1 text-xs" isLoading={isProcessing} title={t.ttDownloadBmp}>
        {t.downloadBmp}
      </Button>
    )}
    <Button onClick={onDownloadBin} icon={<FileCode size={14} />} className="w-full py-1 text-xs" disabled={disableBinWhileProcessing && isProcessing} title={t.ttDownloadBin}>
      {t.downloadBin}
    </Button>
    <Button onClick={onDownloadZx7} icon={<FileCode size={14} />} className="w-full py-1 text-xs" disabled={disableBinWhileProcessing && isProcessing} title={t.ttDownloadBinZX7}>
      {t.downloadBinZX7}
    </Button>
  </div>
);

export default ExportButtons;
