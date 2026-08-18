declare module "*.geojson" {
  const value: {
    type?: string;
    features?: Array<{
      type?: string;
      properties?: {
        name?: string;
      };
      geometry?: {
        coordinates?: [number, number];
      };
    }>;
  };
  export default value;
}

declare module "*.geojson?raw" {
  const value: string;
  export default value;
}
