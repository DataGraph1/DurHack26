import { useEffect, useState, useCallback } from "react";
import { useDeviceOrientation, type OrientationData } from "./useDeviceOrientation";

const fmt = (n: number | null) => (n === null ? "n/a" : n.toFixed(1));

interface ControllerProps {
    ghosts: Record<string, number>;
    player_offset: [number, number];
    onUpdate?: (closestDif: number, closestId: string) => void;
}

export function Controller({ ghosts, player_offset, onUpdate }: ControllerProps) {
    const [closestGhostDif, setClosestGhostDif] = useState<number>(0);
    const [closestGhostId, setClosestGhostId] = useState<string>("-1");

    const { orientation, latest, permission, requestPermission } =
        useDeviceOrientation();

    // --- math helpers (unchanged) ---
    function degrees_to_radians(degrees: number): number {
        return degrees * (Math.PI / 180);
    }
    function sub_coords(a: [number, number], b: [number, number]): [number, number] {
        return [a[0] - b[0], a[1] - b[1]];
    }
    function add_coords(a: [number, number], b: [number, number]): [number, number] {
        return [a[0] + b[0], a[1] + b[1]];
    }
    function div_coords(a: [number, number], b: [number, number]): [number, number] {
        return [a[0] / b[0], a[1] / b[1]];
    }
    function abs_coords(c: [number, number]): [number, number] {
        return [Math.abs(c[0]), Math.abs(c[1])];
    }
    function calcAngleDegrees(x: number, y: number): number {
        return (Math.atan2(y, x) * 180) / Math.PI;
    }

    function local_rot(global_rot: number, local_center: [number, number]) {
        const global_radius = 2;
        let global_point: [number, number] = [
            global_radius * Math.cos(degrees_to_radians(global_rot)),
            global_radius * Math.sin(degrees_to_radians(global_rot))
        ];
        let v: [number, number] = sub_coords(global_point, local_center);
        let local_point = add_coords(local_center, div_coords(v, abs_coords(v)));
        return calcAngleDegrees(local_point[0], local_point[1]);
    }

    // --- find the closest ghost ---
    const findClosestGhost = useCallback((player_rot: number) => {
        let closest_rot = 1000;
        let closest_id = "-1";

        for (let key in ghosts) {
            let value = ghosts[key];
            let rot = local_rot(value, player_offset);

            if (rot < closest_rot) {
                closest_rot = rot;
                closest_id = key;
            }
        }

        setClosestGhostDif(closest_rot);
        setClosestGhostId(closest_id);
        onUpdate?.(closest_rot, closest_id);
    }, [ghosts, player_offset, onUpdate]);

    // --- poll the orientation sensor and recompute ---
    useEffect(() => {
        if (!latest.current) {
            latest.current = {
                alpha: 0,
                beta: 0,
                gamma: 0,
                absolute: true,
            };
        }

        const id = setInterval(() => {
            if (latest.current) {
                const alpha = Number(fmt(latest.current.alpha));
                console.log("GHOSTS:", ghosts);
                console.log("GHOST COUNT:", Object.keys(ghosts).length);
                findClosestGhost(alpha);
                console.log("DIF:", closestGhostDif);
                console.log("ID:", closestGhostId);
            }
        }, 100);

        return () => clearInterval(id);
    }, [permission, latest, ghosts, findClosestGhost]);

    if (permission === "unsupported") return <p>Device orientation not supported.</p>;
    if (permission === "denied") return <p>Permission denied.</p>;

    return (
        <div>
            <p>Closest ghost diff: {closestGhostDif}</p>
            <p>Closest ghost id: {closestGhostId}</p>
        </div>
    );
}