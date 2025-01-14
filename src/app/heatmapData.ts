import { FeatureCollection } from 'geojson';

export default {
  type: 'FeatureCollection',
  features: [
      {
          type: 'Feature',
          properties: { customProperty: 1 },
          geometry: {
              type: 'MultiPoint',
              coordinates: [
                  [55.44, 25.34],
                  [55.43, 25.37],
                  [55.41, 25.34],
              ],
          },
      },
      {
          type: 'Feature',
          properties: { customProperty: 2 },
          geometry: {
              type: 'Point',
              coordinates: [55.4, 25.3],
          },
      },
  ],
} as FeatureCollection;