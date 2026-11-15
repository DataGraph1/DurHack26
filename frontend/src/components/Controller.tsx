import { useEffect, useState } from "react";
import { useDeviceOrientation, type OrientationData } from "./useDeviceOrientation";

const fmt = (n: number | null) => (n === null ? "n/a" : n.toFixed(1));


export default function Controller() {
    const { orientation, latest, permission, requestPermission } =
        useDeviceOrientation();
    const [text, setText] = useState("Waiting for sensor data...");

    function doSomething(data: OrientationData) {
        setText(
            `alpha: ${fmt(data.alpha)}°\n` +
            `beta:  ${fmt(data.beta)}°\n` +
            `gamma: ${fmt(data.gamma)}°`
        );
    }

    useEffect(() => {
        if (permission !== "granted") return;

        const id = setInterval(() => {
        if (latest.current) doSomething(latest.current);
        }, 10);

        return () => clearInterval(id);
    }, [permission, latest]);

    if (permission === "unsupported") return <p>Device orientation not supported.</p>;
    if (permission === "denied") return <p>Permission denied.</p>;

    // implementation of: https://stackoverflow.com/questions/300871
    function local_rot(global_rot: number, local_center: [number, number]) {
        const global_radius = 2;
        let global_point : [number, number] = [
            global_radius * Math.cos(degrees_to_radians(global_rot)),
            global_radius * Math.sin(degrees_to_radians(global_rot))
        ];
        console.log("global_point:", global_point);

        const local_radius = 1;
        let v : [number, number] = sub_coords(global_point, local_center);
        console.log("v:", v);
        let local_point = add_coords(local_center, div_coords(v, abs_coords(v)));
        console.log("local_point:", local_point);

        return calcAngleDegrees(local_point[0], local_point[1]);
    }
    function degrees_to_radians(degrees: number): number {
        var pi = Math.PI;
        return degrees * (pi/180);
    }
    function sub_coords(coord1: [number, number], coord2: [number, number]): [number, number] {
        return [coord1[0] - coord2[0], coord1[1] - coord2[1]];
    }
    function add_coords(coord1: [number, number], coord2: [number, number]): [number, number] {
        return [coord1[0] + coord2[0], coord1[1] + coord2[1]];
    }
    function div_coords(coord1: [number, number], coord2: [number, number]): [number, number] {
        return [coord1[0] / coord2[0], coord1[1] / coord2[1]];
    }
    function abs_coords(coord: [number, number]): [number, number] {
        return [Math.abs(coord[0]), Math.abs(coord[1])];
    }
    function calcAngleDegrees(x: number, y: number): number {
        return (Math.atan2(y, x) * 180) / Math.PI;
    }

    console.log(useDeviceOrientation());
    

    return (
        <div>
            <h1>hi</h1>
            {permission !== "granted" && (
                <button onClick={requestPermission}>Enable motion sensors</button>
            )}
            <pre>{text}</pre>
            <h1>bye</h1>
        </div>
    );
}