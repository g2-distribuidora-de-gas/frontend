import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import {
  STOMP_CLIENT_FACTORY,
  STOMP_WEBSOCKET_FACTORY,
} from './services/realtime.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        {
          provide: STOMP_WEBSOCKET_FACTORY,
          useValue: () => null,
        },
        {
          provide: STOMP_CLIENT_FACTORY,
          useValue: () => {
            throw new Error('not used in this test');
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
