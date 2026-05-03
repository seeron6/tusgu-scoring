"use client";
import * as React from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { X, ScanLine, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Full-screen barcode scanner. Calls onResult with the decoded text and
 * stops the camera. The user can also stop manually with the close button.
 */
export function BarcodeScannerModal({
  open,
  onClose,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (text: string) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const controlsRef = React.useRef<IScannerControls | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [cameras, setCameras] = React.useState<MediaDeviceInfo[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    let cancelled = false;

    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        setCameras(devices);
        // Prefer rear-facing camera if we can identify it from the label.
        const rear =
          devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[devices.length - 1];
        setActiveId(rear?.deviceId ?? null);
      } catch (e) {
        setError(toMessage(e));
      }
    })();

    return () => {
      cancelled = true;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!open || !activeId || !videoRef.current) return;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();
    setError(null);

    reader
      .decodeFromVideoDevice(activeId, videoRef.current, (result, err, controls) => {
        if (cancelled) return;
        if (result) {
          const text = result.getText();
          controls.stop();
          controlsRef.current = null;
          onResult(text);
          onClose();
        }
        // err may be NotFoundException (no barcode this frame) — ignore those
        // because the reader keeps trying.
      })
      .then((controls) => {
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      })
      .catch((e) => {
        if (!cancelled) setError(toMessage(e));
      });

    return () => {
      cancelled = true;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeId]);

  function stopScanner() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
      if (video) video.srcObject = null;
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col animate-fade-in">
      <div className="flex items-center justify-between px-4 py-3 text-white border-b border-white/10">
        <div className="flex items-center gap-2">
          <ScanLine className="w-5 h-5" />
          <div className="font-semibold">Scan barcode</div>
        </div>
        <button
          onClick={() => {
            stopScanner();
            onClose();
          }}
          className="p-2 -mr-2 text-white/80 hover:text-white"
          aria-label="Close scanner"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
        />
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="border-2 border-white/80 rounded-2xl w-[min(80%,420px)] aspect-[3/2] shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
        {error && (
          <div className="absolute inset-x-4 bottom-20 bg-[#B8341A] text-white text-sm rounded-md px-4 py-3 flex items-start gap-2">
            <Camera className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium mb-0.5">Camera unavailable</div>
              <div className="opacity-90 text-xs leading-relaxed">{error}</div>
              <div className="opacity-80 text-xs mt-1">
                Allow camera access in your browser, then try again.
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-white/10 flex items-center gap-3">
        {cameras.length > 1 && (
          <select
            value={activeId ?? ""}
            onChange={(e) => setActiveId(e.target.value)}
            className="flex-1 bg-white/10 text-white border border-white/20 rounded-md px-3 py-2 text-sm"
          >
            {cameras.map((c) => (
              <option key={c.deviceId} value={c.deviceId} className="bg-black">
                {c.label || `Camera ${c.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
        )}
        <Button
          variant="outline"
          onClick={() => {
            stopScanner();
            onClose();
          }}
          className="ml-auto"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function toMessage(e: unknown): string {
  if (!e) return "Unknown error";
  if (e instanceof Error) return e.message;
  return String(e);
}
