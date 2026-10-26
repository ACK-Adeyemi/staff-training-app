import { useRef, type ChangeEvent } from 'react';
import { Button } from './Button';

export interface FilePickerButtonsProps {
  takePhotoLabel: string;
  chooseFileLabel: string;
  accept: string;
  onFile: (file: File) => void;
}

export function FilePickerButtons({ takePhotoLabel, chooseFileLabel, accept, onFile }: FilePickerButtonsProps) {
  const camera = useRef<HTMLInputElement>(null);
  const plain = useRef<HTMLInputElement>(null);
  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onFile(file);
  };
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        variant="secondary"
        onClick={() => {
          camera.current?.click();
        }}
      >
        {takePhotoLabel}
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          plain.current?.click();
        }}
      >
        {chooseFileLabel}
      </Button>
      <input ref={camera} type="file" accept={accept} capture="environment" hidden tabIndex={-1} onChange={handle} />
      <input ref={plain} type="file" accept={accept} hidden tabIndex={-1} onChange={handle} />
    </div>
  );
}
