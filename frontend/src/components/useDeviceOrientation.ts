// useDeviceOrientation.ts
import { useCallback, useEffect, useRef, useState } from "react";

export interface OrientationData {
  alpha: number | null; // z-axis rotation (0-360)
  beta: number | null;  // x-axis tilt (-180 to 180)
  gamma: number | null; // y-axis tilt (-90 to 90)
  absolute: boolean;
}

type PermissionState = "unknown" | "granted" | "denied" | "unsupported";

interface DeviceOrientationEventiOS extends DeviceOrientationEvent {}
interface DeviceOrientationEventConstructoriOS {
  requestPermission?: () => Promise<"granted" | "denied">;
}

export function useDeviceOrientation() {
  const [permission, setPermission] = useState<PermissionState>(
    typeof window !== "undefined" && "DeviceOrientationEvent" in window
      ? "unknown"
      : "unsupported"
  );
  const [orientation, setOrientation] = useState<OrientationData | null>(null);

  // Ref holds the latest value so loops can read it without re-subscribing
  const latest = useRef<OrientationData | null>(null);

  const handler = useCallback((e: DeviceOrientationEvent) => {
    const data: OrientationData = {
      alpha: e.alpha,
      beta: e.beta,
      gamma: e.gamma,
      absolute: e.absolute,
    };
    latest.current = data;
    setOrientation(data);
  }, []);

  const requestPermission = useCallback(async () => {
    const DOE =
      DeviceOrientationEvent as unknown as DeviceOrientationEventConstructoriOS;

    if (typeof DOE.requestPermission === "function") {
      try {
        const result = await DOE.requestPermission();
        setPermission(result);
      } catch {
        setPermission("denied");
      }
    } else {
      // Android / desktop: no prompt needed
      setPermission("granted");
    }
  }, []);

  useEffect(() => {
    if (permission !== "granted") return;
    window.addEventListener("deviceorientation", handler);
    return () => window.removeEventListener("deviceorientation", handler);
  }, [permission, handler]);

  return { orientation, latest, permission, requestPermission };
}