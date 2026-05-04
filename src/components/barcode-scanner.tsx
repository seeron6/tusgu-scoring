"use client";
import * as React from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { X, ScanLine, Camera, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Decode hint set — explicitly include QR plus the 1-D barcode formats most
// likely to appear on competition stickers / lanyards.
const HINTS = new Map();
HINTS.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.AZTEC,
  BarcodeFormat.PDF_417,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
]);
HINTS.set(DecodeHintType.TRY_HARDER, true);

/**
 * Full-screen QR / barcode scanner. Calls onResult with the decoded text and
 * stops the camera. Works on iOS Safari, Android Chrome, and desktop browsers.
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
  const [status, setStatus] = React.useState<"idle" | "starting" | "scanning" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [facing, setFacing] = React.useState<"environment" | "user">("environment");
  const [hasMultipleCameras, setHasMultipleCameras] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function start() {
      setStatus("starting");
      setError(null);

      // Sanity check — getUserMedia is only available on HTTPS / localhost.
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setError(
          "Camera API isn't available. Make sure you're on the live HTTPS site, not http://."
        );
        return;
      }

      const reader = new BrowserMultiFormatReader(HINTS);

      try {
        // decodeFromConstraints triggers the iOS/Android permission prompt.
        // Using facingMode lets us pick rear-camera on phones without first
        // doing enumerateDevices (which often returns empty labels until
        // permission is granted, especially on iOS Safari).
        const controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: facing },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          },
          videoRef.current!,
          (result, err, ctrl) => {
            if (cancelled) return;
            if (result) {
              ctrl.stop();
              controlsRef.current = null;
              onResult(result.getText());
              onClose();
            }
            // err is NotFoundException on every frame without a barcode — ignore.
          }
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStatus("scanning");

        // After permission is granted we can enumerate to know whether a
        // front/back toggle is even useful.
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const cams = devices.filter((d) => d.kind === "videoinput");
          if (!cancelled) setHasMultipleCameras(cams.length > 1);
        } catch {
          /* ignore */
        }
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError(toMessage(e));
      }
    }

    start();
    return () => {
      cancelled = true;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

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

  function close() {
    stopScanner();
    onClose();
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col animate-fade-in">
      <div className="flex items-center justify-between px-4 py-3 text-white border-b border-white/10">
        <div className="flex items-center gap-2">
          <ScanLine className="w-5 h-5" />
          <div className="font-semibold">Scan barcode or QR code</div>
        </div>
        <button
          onClick={close}
          className="p-2 -mr-2 text-white/80 hover:text-white"
          aria-label="Close scanner"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover bg-black"
          playsInline
          muted
          autoPlay
        />
        {status === "scanning" && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="border-2 border-white/80 rounded-2xl w-[min(80%,420px)] aspect-square shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </div>
        )}
        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Starting camera…
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-x-4 bottom-20 bg-[#B8341A] text-white text-sm rounded-md px-4 py-3 flex items-start gap-2">
            <Camera className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium mb-0.5">Camera unavailable</div>
              <div className="opacity-90 text-xs leading-relaxed">{error}</div>
              <div className="opacity-80 text-xs mt-1.5">
                On iPhone: Settings → Safari → Camera → Allow. On Android: tap the lock
                icon in the address bar → Permissions → Camera.
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-white/10 flex items-center gap-2">
        {hasMultipleCameras && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              stopScanner();
              setFacing((f) => (f === "environment" ? "user" : "environment"));
            }}
            className="border-white/20 text-white bg-white/10 hover:bg-white/20"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            {facing === "environment" ? "Front camera" : "Rear camera"}
          </Button>
        )}
        <div className="text-[11px] text-white/60 hidden sm:block">
          Hold a barcode or QR code inside the frame.
        </div>
        <Button variant="outline" onClick={close} className="ml-auto">
          Cancel
        </Button>
      </div>
    </div>
  );
}

function toMessage(e: unknown): string {
  if (!e) return "Unknown error";
  if (e instanceof Error) {
    if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
      return "Camera access was denied. Allow camera permission and try again.";
    }
    if (e.name === "NotFoundError" || e.name === "DevicesNotFoundError") {
      return "No camera found on this device.";
    }
    if (e.name === "NotReadableError" || e.name === "TrackStartError") {
      return "Camera is in use by another app. Close other apps using it and retry.";
    }
    if (e.name === "OverconstrainedError") {
      return "Couldn't open the requested camera. Try toggling front/rear.";
    }
    return e.message || e.name;
  }
  return String(e);
}
