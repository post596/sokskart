import { describe, expect, it } from 'vitest';
import { eksporterCsv, importerCsv } from './csv';
import { kopierStatistikk } from './lpb-stats';

describe('CSV-import av statistikk', () => {
  it('leser semikolon og desimalkomma, og setter verifisert', () => {
    const csv = 'kategori;terreng;r25;r50;r75;r95;gangfart;mobilitet;verifisert\nDemens;fjell;0,4;1;2,5;9;1,2;10;ja\n';
    const r = importerCsv(csv, kopierStatistikk());
    expect(r.feil).toEqual([]);
    const d = r.stats.find((s) => s.key === 'dement')!;
    expect(d.fjell).toEqual({ r25: 0.4, r50: 1, r75: 2.5, r95: 9 });
    expect(d.flatt.r25).toBe(0.3); // unchanged
    expect(d.gangfart).toBe(1.2);
    expect(d.mobilitet).toBe(10);
    expect(d.verifisert).toBe(true);
    expect(r.endret).toEqual(['Demens']);
  });
  it('gjenkjenner nøkkel og navn uansett store bokstaver og bindestrek', () => {
    const csv = 'kategori,r25,r50,r75,r95\nfisker,0.5,1,2,4\nskiløper langrenn,1,2,3,4\n';
    const r = importerCsv(csv, kopierStatistikk());
    expect(r.feil).toEqual([]);
    expect(r.stats.find((s) => s.key === 'fisker')!.flatt.r95).toBe(4);
    expect(r.stats.find((s) => s.key === 'langrenn')!.fjell.r25).toBe(1);
  });
  it('melder feil for ukjent kategori og ugyldige ringer, men tar med resten', () => {
    const csv = 'kategori;r25;r50;r75;r95\nUfo;1;2;3;4\nJeger;3;2;1;4\nTurgåer;1;2;3;4\n';
    const r = importerCsv(csv, kopierStatistikk());
    expect(r.feil).toHaveLength(2);
    expect(r.endret).toEqual(['Turgåer']);
  });
  it('krever kolonnene for ringene', () => {
    expect(importerCsv('kategori;r25\nDemens;1\n', kopierStatistikk()).feil[0]).toMatch(/r50/);
  });
  it('eksport kan importeres igjen uten endring', () => {
    const stats = kopierStatistikk();
    stats[0].verifisert = true;
    stats[0].kilde = 'LPB "test"';
    const r = importerCsv(eksporterCsv(stats), kopierStatistikk());
    expect(r.feil).toEqual([]);
    expect(r.stats).toEqual(stats);
  });
});
