import { Component, OnInit, viewChild } from '@angular/core';
import { Signal,  ElementRef } from '@angular/core';
import { load } from '@2gis/mapgl';
import * as mapgl from '@2gis/mapgl/types/index'; 
import type { Map } from '@2gis/mapgl/types/map';
import type { Marker } from '@2gis/mapgl/types/objects/marker';
import type { GeoJsonSource } from '@2gis/mapgl/types/sources/geoJsonSource';
import heatmapData from './heatmapData';
import { Feature, FeatureCollection } from 'geojson';
import type { Layer } from '@2gis/mapgl/types/types/styles';
import { Clusterer } from '@2gis/mapgl-clusterer';
import type { InputMarker, ClustererPointerEvent } from '@2gis/mapgl-clusterer';
import markers from './markers';

type MapglAPI = typeof mapgl;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  mapHTMLContainer: Signal<ElementRef | undefined> = viewChild<ElementRef>('map');
  mapgl: MapglAPI | null = null;
  map: Map | null = null;

  private readonly GISKey = '79f33f23-38ba-4c7b-b375-7026497fc371';

  async ngOnInit(): Promise<void> {
    this.mapgl = await load();
    
    this.map = new this.mapgl.Map(
      this.mapHTMLContainer()?.nativeElement,
      {
        center: [55.31878, 25.23584],
        zoom: 13,
        key: this.GISKey,
      }
    );

    // this.addMarker([55.31878, 25.23584]);
    this.addHeatmap(heatmapData); 
    this.addClusterer(markers);
  }

  // пример добавления маркера на карту
  addMarker(coordinates: number[]): Marker | void {
    if (!this.mapgl || !this.map) {
      return;
    }

    return new this.mapgl.Marker(this.map, {
      coordinates,
    });
  }

  // пример добавления тепловой карты на карту
  // docs: https://docs.2gis.com/ru/mapgl/map-style/examples/heatmap
  addHeatmap(data: FeatureCollection | Feature): void {
    if (!this.mapgl || !this.map) {
      return;
    }

    const source: GeoJsonSource = new this.mapgl.GeoJsonSource(this.map, {
      data,
      attributes: {
        purpose: 'heatmap'
      }
    });

    const layer: Layer = {
      id: 'my-heatmap-layer',
      filter: [
        'match',
        ['sourceAttr', 'purpose'],
        ['heatmap'],
        true,
        false
      ],
      type: 'heatmap',
      style: {
        color: [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(0, 153, 255, 0)',
          0.2,
          'rgb(32, 172, 74)',
          0.4,
          'rgb(115, 255, 0)',
          0.6,
          'rgba(255, 252, 0, 1)',
          0.8,
          'rgb(255, 153, 0)',
          1,
          'rgb(255, 0, 0)',
        ],
        radius: 50,
        weight: ['get', 'customProperty'],
        intensity: 0.8,
        opacity: 0.8,
        downscale: 1
      },
    };

    this.map.on('styleload', () => {
      this.map?.addLayer(layer);
    });
  }

  // Пример добавления кластера
  // docs: https://docs.2gis.com/ru/mapgl/objects/clustering
  addClusterer(markers: InputMarker[]): void {
    const clusterer = new Clusterer(this.map, {
      radius: 60,
    });

    clusterer.load(markers);

    clusterer.on('click', (event: ClustererPointerEvent): void => {
      if (event.target.type === 'cluster') {
        this.map?.setCenter(event.lngLat,
          {
            easing: 'easeOutCubic',
            duration: 800
          });

        this.map?.setZoom(
          clusterer.getClusterExpansionZoom(event.target.id),
          {
            easing: 'easeOutCubic',
            useHeightForAnimation: true,
            duration: 800
          }
        );
      }
    });
  }
}
