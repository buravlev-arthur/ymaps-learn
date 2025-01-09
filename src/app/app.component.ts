import { Component, OnInit, viewChild } from '@angular/core';
import type { Signal,  ElementRef } from '@angular/core';
import type { YMap, YMapLocationRequest  } from 'ymaps3';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  mapHTMLContainer: Signal<ElementRef | undefined> = viewChild<ElementRef>('ymap')
  initLocation: YMapLocationRequest = {
    center: [37.588144, 55.733842],
    zoom: 9
  };
  map: YMap | undefined;

  async ngOnInit(): Promise<void> {
    await ymaps3.ready;

    const { YMap, YMapDefaultSchemeLayer } = ymaps3;

    this.map = new YMap(
      this.mapHTMLContainer()?.nativeElement,
      {
        location: this.initLocation
      }
    );

    this.map.addChild(new YMapDefaultSchemeLayer({}));
  }
}