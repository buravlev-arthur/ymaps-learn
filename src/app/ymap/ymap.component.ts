import { Component, OnInit, viewChild } from '@angular/core';
import type { Signal,  ElementRef } from '@angular/core';
import type { YMap, YMapLocationRequest, YMapFeature  } from 'ymaps3';
import { YMapClusterer, clusterByGrid, type Feature } from 'ymaps3/clusterer';
import {
  BOUNDS,
  LOCATION,
  MARGIN,
  getRandomPoints as getRandomPointsCluster,
  marker,
  cluster
} from './cluster-change-control.class';
import {
  getRandomPoints as getRandomPointsHeatmap,
  getDefaultMapProps,
  getHeatmapImpl
} from './heatmap-gl-impl';


@Component({
  selector: 'app-ymap',
  standalone: true,
  imports: [],
  templateUrl: './ymap.component.html',
  styleUrl: './ymap.component.scss'
})
export class AppComponent implements OnInit {
  mapHTMLContainer: Signal<ElementRef | undefined> = viewChild<ElementRef>('ymap')
  initLocation: YMapLocationRequest = {
    center: [37.588144, 55.733842],
    zoom: 9
  };
  map: YMap | undefined;
  pointsCount: number = 100;
  points: Feature[] = [];
  markers: YMapFeature[] = [];

  async ngOnInit(): Promise<void> {
    await ymaps3.ready;

    this.points = getRandomPointsCluster(this.pointsCount, BOUNDS);

    this.map = new ymaps3.YMap(
      this.mapHTMLContainer()?.nativeElement,
      {
        location: LOCATION,
        margin: MARGIN,
        showScaleInCopyrights: false,
        projection: getDefaultMapProps().projection // for WebGL working
      },
      [
        new ymaps3.YMapDefaultSchemeLayer({}),
        new ymaps3.YMapDefaultFeaturesLayer({})
      ]
    );

    /* We create a clusterer object and add it to the map object.
      As parameters, we pass the clustering method, an array of features, the functions for rendering markers and clusters.
      For the clustering method, we will pass the size of the grid division in pixels.
    */
    const clusterer = new YMapClusterer({
      method: clusterByGrid({ gridSize: 64 }),
      features: this.points,
      marker,
      cluster: cluster(this.map)
    });

    this.map.addChild(clusterer);

    /* Heatmap Layer */
    const points = getRandomPointsHeatmap(1500);

    this.map.addChild(
      new ymaps3.YMapLayer({
        id: 'heatmap',
        type: 'custom',
        zIndex: 1201,
        grouppedWith: `${ymaps3.YMapDefaultSchemeLayer.defaultProps.source}:buildings`,
        source: ymaps3.YMapDefaultSchemeLayer.defaultProps.source,
        implementation: ({ effectiveMode }: { effectiveMode: string }) =>
          effectiveMode === 'vector' ? getHeatmapImpl(getDefaultMapProps().projection, () => points) : undefined
        })
      );
  }
}