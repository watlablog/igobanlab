declare module "@sabaki/influence" {
  export type BoardData = number[][];

  export type InfluenceOptions = {
    discrete?: boolean;
    maxDistance?: number;
    minRadiance?: number;
  };

  export type InfluenceApi = {
    map(data: BoardData, options?: InfluenceOptions): number[][];
    areaMap(data: BoardData): number[][];
    nearestNeighborMap(data: BoardData, sign: -1 | 1): number[][];
    radianceMap(data: BoardData, sign: -1 | 1, options?: Record<string, number>): number[][];
  };

  const influence: InfluenceApi;
  export = influence;
}

declare module "@sabaki/deadstones" {
  export type BoardData = number[][];
  export type Vertex = [number, number];

  export type DeadstonesApi = {
    useFetch(path: string): DeadstonesApi;
    guess(data: BoardData, options?: { finished?: boolean; iterations?: number }): Promise<Vertex[]>;
    playTillEnd(data: BoardData, sign: -1 | 1): Promise<BoardData>;
    getProbabilityMap(data: BoardData, iterations: number): Promise<BoardData>;
    getFloatingStones(data: BoardData): Promise<Vertex[]>;
  };

  const deadstones: DeadstonesApi;
  export = deadstones;
}

declare module "*.wasm?url" {
  const src: string;
  export default src;
}
