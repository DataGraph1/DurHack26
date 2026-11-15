import useDeviceOrientation from './useDeviceOrientation.ts'

export default function Controller() {
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
    

    return(
        <div>
            
        </div>
    )
} 