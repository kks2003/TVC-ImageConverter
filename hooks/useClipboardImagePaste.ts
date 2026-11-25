import { useEffect, useRef } from 'react';

// Returns the first image in a paste event's clipboard data, if any.
export const imageFromClipboard = (data: DataTransfer | null): File | null => {
  if (!data) return null;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  for (const file of Array.from(data.files ?? [])) {
    if (file.type.startsWith('image/')) return file;
  }
  return null;
};

const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

// Calls onImage with a pasted image (Ctrl+V / Cmd+V anywhere on the page),
// unless `enabled` is false or the user is typing into a text field.
export const useClipboardImagePaste = (onImage: (file: File) => void, enabled: boolean) => {
  const latest = useRef(onImage);
  latest.current = onImage;

  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      if (isTextField(e.target)) return;
      const file = imageFromClipboard(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      // Clipboard images are usually just "image.png": give them a clearer
      // base name for the exported files.
      const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      const named = file.name && file.name !== `image.${ext}` && file.name !== 'image.png'
        ? file
        : new File([file], `clipboard.${ext}`, { type: file.type });
      latest.current(named);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [enabled]);
};
