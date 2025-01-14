import type { LngLatBounds, LngLat, YMapLocationRequest, Margin, YMap, PolygonGeometry } from 'ymaps3';
import type { Feature } from 'ymaps3/clusterer';
import * as turf from '@turf/turf';


interface ClustererChangeControlProps {
  toggleClusterer: () => void;
  changePointsCount: (count: number) => void;
  updatePoints: () => void;
}

export class ClustererChangeControl extends ymaps3.YMapComplexEntity<ClustererChangeControlProps> {
  private _element: HTMLDivElement | null = null;
  private _detachDom: (() => void) | null = null;

  // Method for create a DOM control element
  _createElement(props: ClustererChangeControlProps) {
      const {toggleClusterer, changePointsCount, updatePoints} = props;

      const clustererChange = document.createElement('div');
      clustererChange.classList.add('clusterer-change');

      const inputSection = document.createElement('div');
      inputSection.classList.add('clusterer-change__section');

      const inputLabel = document.createElement('div');
      inputLabel.classList.add('clusterer-change__input__label');
      inputLabel.textContent = 'Point count:';
      inputSection.appendChild(inputLabel);

      const inputField = document.createElement('input');
      inputField.type = 'number';
      inputField.classList.add('clusterer-change__input');
      inputField.value = '100';
      inputField.addEventListener('input', (e: Event) => {
          const target = e.target as HTMLInputElement;
          changePointsCount(Number(target.value));
      });
      inputSection.appendChild(inputField);

      const btnSection = document.createElement('div');
      btnSection.classList.add('clusterer-change__buttons');

      const updatePointsBtn = document.createElement('button');
      updatePointsBtn.type = 'button';
      updatePointsBtn.classList.add('clusterer-change__btn');
      updatePointsBtn.textContent = 'Update points';
      updatePointsBtn.addEventListener('click', updatePoints);
      btnSection.appendChild(updatePointsBtn);

      const toggleClustererBtn = document.createElement('button');
      toggleClustererBtn.type = 'button';
      toggleClustererBtn.id = 'toggleBtn';
      toggleClustererBtn.classList.add('clusterer-change__btn');
      toggleClustererBtn.textContent = 'Disable cluster mode';
      toggleClustererBtn.addEventListener('click', toggleClusterer);
      btnSection.appendChild(toggleClustererBtn);

      const dividerElement = document.createElement('hr');
      dividerElement.classList.add('divider');

      clustererChange.appendChild(inputSection);
      clustererChange.appendChild(dividerElement);
      clustererChange.appendChild(btnSection);

      return clustererChange;
  }

  // Method for attaching the control to the map
  override _onAttach() {
      this._element = this._createElement(this._props);
      this._detachDom = ymaps3.useDomContext(this, this._element, this._element);
  }

  // Method for detaching control from the map
  override _onDetach() {
      if (this._detachDom) {
        this._detachDom();
      }
      this._detachDom = null;
      this._element = null;
  }
}

// Generating random coordinates of a point [lng, lat] in a given boundary
const getRandomPointCoordinates = (bounds: LngLatBounds): LngLat => [
  bounds[0][0] + (bounds[1][0] - bounds[0][0]) * rnd(),
  bounds[1][1] + (bounds[0][1] - bounds[1][1]) * rnd()
];

// A function that creates an array with parameters for each clusterer random point
export const getRandomPoints = (count: number, bounds: LngLatBounds): Feature[] => {
  return Array.from({length: count}, (_, index) => ({
    type: 'Feature',
    id: index.toString(),
    geometry: {type: 'Point', coordinates: getRandomPointCoordinates(bounds)}
  }));
};

// Function for generating a pseudorandom number
const seed = (s: number) => () => {
  s = Math.sin(s) * 10000;
  return s - Math.floor(s);
};

const rnd = seed(10000); // () => Math.random()

export const COMMON_LOCATION_PARAMS: Partial<YMapLocationRequest> = {easing: 'ease-in-out', duration: 2000};

export const MARGIN: Margin = [100, 100, 100, 100];

/* Rectangle bounded by bottom-left and top-right coordinates
Inside it, we generate the first bundle of clusterer points */
export const BOUNDS: LngLatBounds = [
  [30.2729, 59.9558],
  [30.4179, 59.9212]
];

export const LOCATION: YMapLocationRequest = {
  zoom: 11.6,
  center: [30.3951, 59.9393]
};

export function getBounds(coordinates: LngLat[]): LngLatBounds {
  let minLat = Infinity,
    minLng = Infinity;
  let maxLat = -Infinity,
    maxLng = -Infinity;

  for (const coords of coordinates) {
    const lat = coords[1];
    const lng = coords[0];

    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat]
  ] as LngLatBounds;
}

/* We declare the function for rendering ordinary markers, we will submit it to the clusterer settings.
Note that the function must return any Entity element. In the example, this is YMapDefaultMarker. */
export const marker = (feature: Feature) =>
  new ymaps3.YMapFeature({
      geometry: getCircleGeoJSON(feature.geometry.coordinates, 55),
      style: { simplificationRate: 0 }
  });

function circle(count: number) {
  const circle = document.createElement('div');
  circle.classList.add('circle');
  circle.innerHTML = `
    <div class="circle-content">
      <span class="circle-text">${count}</span>
    </div>
  `;
  return circle;
}

// As for ordinary markers, we declare a cluster rendering function that also returns an Entity element.
export const cluster = (map: YMap) =>
  (coordinates: LngLat, features: Feature[]) =>
    new ymaps3.YMapMarker(
      {
        coordinates,
        onClick() {
          const bounds = getBounds(features
            .map((feature: Feature) => feature.geometry.coordinates));
          map.update({location: {bounds, ...COMMON_LOCATION_PARAMS}});
        }
      },
      circle(features.length).cloneNode(true) as HTMLElement
    );

export const getCircleGeoJSON = (center: LngLat, radiusMeters: number): PolygonGeometry => {
  const { geometry } = turf.circle(center as number[], radiusMeters, { units: 'meters' });
  return geometry as PolygonGeometry;
};