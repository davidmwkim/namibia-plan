// tests/api/public-surface.test.js
// Asserts the existence and shape of the public window.* surfaces that v12/v13/v14
// rely on (and that downstream tests, scripts, and future patches will too).
import { describe, it, expect } from 'vitest';
import { bootPwa } from '../helpers/boot-pwa.js';

describe('public window surfaces', () => {
  it('NamibiaSunTimes exposes the documented functions', async () => {
    const dom = await bootPwa();
    const ST = dom.window.NamibiaSunTimes;
    expect(typeof ST.sunriseSunsetUtc).toBe('function');
    expect(typeof ST.etaFromCurrentStep).toBe('function');
    expect(typeof ST.sunsetMargin).toBe('function');
    expect(typeof ST.formatTimeOfDay).toBe('function');
    expect(typeof ST.formatRelative).toBe('function');
    expect(typeof ST.parseDurationToMinutes).toBe('function');
    expect(typeof ST.parseDistanceToMeters).toBe('function');
  });

  it('NamibiaDrivingCore exposes the documented functions', async () => {
    const dom = await bootPwa();
    const DC = dom.window.NamibiaDrivingCore;
    expect(typeof DC.findCurrentStep).toBe('function');
    expect(typeof DC.bearingForStreetView).toBe('function');
    expect(typeof DC.relevantCards).toBe('function');
    expect(typeof DC.ttsTriggerThresholds).toBe('function');
    expect(typeof DC.shouldAnnounceNow).toBe('function');
    expect(typeof DC.projectOntoSegment).toBe('function');
    expect(typeof DC.distMeters).toBe('function');
    expect(typeof DC.bearing).toBe('function');
  });

  it('NamibiaTTS exposes speak/mute/unmute/toggle/replayLast/isMuted/preGenerate', async () => {
    const dom = await bootPwa();
    const T = dom.window.NamibiaTTS;
    expect(typeof T.speak).toBe('function');
    expect(typeof T.mute).toBe('function');
    expect(typeof T.unmute).toBe('function');
    expect(typeof T.toggle).toBe('function');
    expect(typeof T.replayLast).toBe('function');
    expect(typeof T.isMuted).toBe('function');
    expect(typeof T.preGenerate).toBe('function');
  });

  it('__namibiaSpoofGps / __namibiaSpoofTrack / __namibiaSpoofClock are present and idempotent', async () => {
    const dom = await bootPwa();
    const w = dom.window;
    expect(typeof w.__namibiaSpoofGps).toBe('function');
    expect(typeof w.__namibiaSpoofTrack).toBe('function');
    expect(typeof w.__namibiaSpoofClock).toBe('function');
    // Idempotent: calling twice with the same args doesn't throw and produces
    // the same state.gps.
    w.__namibiaSpoofGps({ lat: -22.5, lng: 17.0 });
    const first = JSON.stringify(w.state.gps);
    w.__namibiaSpoofGps({ lat: -22.5, lng: 17.0 });
    expect(JSON.stringify(w.state.gps)).toBe(first);
  });

  it('NamibiaV12 helpers are present', async () => {
    const dom = await bootPwa();
    const V12 = dom.window.NamibiaV12;
    expect(typeof V12.decorateRoute).toBe('function');
    expect(typeof V12.buildCards).toBe('function');
    expect(typeof V12.computeSunTimes).toBe('function');
    expect(typeof V12.encodePolyline).toBe('function');
    expect(typeof V12.stepStaticMapUrl).toBe('function');
    expect(typeof V12.stepStreetViewUrl).toBe('function');
    expect(typeof V12.ttsTextFor).toBe('function');
  });

  it('no top-level patch throws on load with the Google Maps stub', async () => {
    // bootPwa would have thrown if any script errored.
    const dom = await bootPwa();
    expect(dom.window.state).toBeTruthy();
  });
});
