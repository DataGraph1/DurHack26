import { useEffect, useRef, useState } from "react";
import { useDeviceOrientation } from "./useDeviceOrientation";

// All angles here are compass-style: degrees clockwise, 0..360.
// Ghost angles from the server are positions on a circle of radius GHOST_RADIUS
// around the room centre; the player stands at player_offset inside that circle.
const GHOST_RADIUS = 2;

interface ControllerProps {
    ghosts: Record<string, number>;
    player_offset: [number, number];
    // diff = signed degrees from where the phone points to the ghost (-180..180)
    onUpdate?: (closestDif: number | null, closestId: string | null) => void;
}

function toRad(deg: number) {
    return (deg * Math.PI) / 180;
}

// wrap any angle difference into -180..180
function wrap180(deg: number) {
    return ((((deg + 180) % 360) + 360) % 360) - 180;
}

// bearing from the player to a ghost sitting on the circle at ghost_angle
function bearingToGhost(ghost_angle: number, player: [number, number]) {
    const gx = GHOST_RADIUS * Math.sin(toRad(ghost_angle));
    const gy = GHOST_RADIUS * Math.cos(toRad(ghost_angle));
    const dx = gx - player[0];
    const dy = gy - player[1];
    return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

// deviceorientation alpha grows counter-clockwise; flip it to a compass heading
function headingFromAlpha(alpha: number | null) {
    return alpha === null ? 0 : (360 - alpha) % 360;
}

export function Controller({ ghosts, player_offset, onUpdate }: ControllerProps) {
    const { orientation, latest, permission, requestPermission } = useDeviceOrientation();
    const [closestGhostDif, setClosestGhostDif] = useState<number | null>(null);
    const [closestGhostId, setClosestGhostId] = useState<string | null>(null);
    const [manualHeading, setManualHeading] = useState(0);

    // backup for laptops / broken sensors: the slider pretends to be the compass
    function aimManually(heading: number) {
        setManualHeading(heading);
        latest.current = { alpha: (360 - heading) % 360, beta: 0, gamma: 0, absolute: true };
    }

    // keep the latest props in a ref so the polling interval doesn't restart every tick
    const props = useRef({ ghosts, player_offset, onUpdate });
    props.current = { ghosts, player_offset, onUpdate };

    useEffect(() => {
        const id = setInterval(() => {
            const { ghosts, player_offset, onUpdate } = props.current;
            const heading = headingFromAlpha(latest.current?.alpha ?? null);

            let bestDif: number | null = null;
            let bestId: string | null = null;
            for (const key in ghosts) {
                const dif = wrap180(bearingToGhost(ghosts[key], player_offset) - heading);
                if (bestDif === null || Math.abs(dif) < Math.abs(bestDif)) {
                    bestDif = dif;
                    bestId = key;
                }
            }

            setClosestGhostDif(bestDif);
            setClosestGhostId(bestId);
            onUpdate?.(bestDif, bestId);
        }, 100);

        return () => clearInterval(id);
    }, [latest]);

    const sensorsOn = permission === "granted" && orientation?.alpha != null;
    const heading = sensorsOn ? headingFromAlpha(orientation.alpha) : manualHeading;

    return (
        <section>
            <h3>sensors</h3>
            {permission === "unsupported" && <p>no motion sensors: use the slider</p>}
            {permission === "denied" && <p>motion sensors blocked: use the slider</p>}
            {(permission === "unknown") && (
                <p><button onClick={requestPermission}>enable motion sensors</button></p>
            )}
            <p>heading: <b>{heading.toFixed(0)}°</b> {sensorsOn ? "(compass)" : "(manual)"}</p>
            {!sensorsOn && (
                <p><input type="range" min={0} max={359} value={manualHeading} style={{ width: "100%" }}
                          onChange={(e) => aimManually(Number(e.target.value))} /></p>
            )}
            <p>closest ghost: <b>{closestGhostId ?? "none"}</b>
                {closestGhostDif !== null && <> ({closestGhostDif.toFixed(0)}° off)</>}
            </p>
        </section>
    );
}
