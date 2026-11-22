# Søkskart

Planleggingsverktøy for søk etter savnet person på land, for frivillige i Norsk Folkehjelp
og innsatsleders kommandoplass (ILKO).

> **Søkskart er et støtteverktøy.** Søksledelsen tar beslutningene. HRS sitt felles system
> for aksjonsstøtte er det offisielle systemet. Statistikken er plassholdere til den er
> kontrollert mot *Lost Person Behavior* (fanen Statistikk).

Appen setter IPP i kartet og viser statistiske søksringer (R25–R95). Den regner ut
**gangtid i terrenget**, det vil si hvor langt personen kan ha gått langs stier og over
terreng på tiden siden sist sett. Den henter og rangerer ledelinjer fra OpenStreetMap,
viser et sannsynlighetskart, og oppdateres når teiger søkes og observasjoner kommer inn.
Den foreslår også punkter å sjekke for tilgjengelige ressurser.

Begreper, navngiving og fargekoder følger *Nasjonal veileder for redningstjenesten ved søk
etter savnet person på land* (HRS, 2022). Modellen er beskrevet i
[docs/modell.md](docs/modell.md).

## Oppstart

Krever Node.js 20 eller nyere.

```powershell
npm install
npm run dev
```

Åpne http://localhost:5173.

| Kommando | Hva |
|---|---|
| `npm run dev` | Utviklingsserver med automatisk omlasting |
| `npm test` | Enhetstester (Vitest) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript-sjekk |
| `npm run build` | Produksjonsbygg til `dist/` (med service worker for bruk uten nett) |
| `npm run preview` | Server produksjonsbygget lokalt (test av PWA og bruk uten nett) |

`.npmrc` legger npm-cachen på `D:/npm-cache`, fordi disk C: var full på
utviklingsmaskinen. Fjern linja `cache=` på andre maskiner.

## Publisering (GitHub Pages)

Bygget er rene statiske filer. Ingen server trengs.

1. Lag et repo på GitHub og push koden.
2. Under *Settings → Pages* velger du *Source: GitHub Actions*.
3. Legg inn `.github/workflows/pages.yml`:

```yaml
name: Publiser
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  bygg:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci --cache .npm
      - run: npm test
      - run: npm run build
        env:
          BASE_PATH: /${{ github.event.repository.name }}/
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  publiser:
    needs: bygg
    runs-on: ubuntu-latest
    environment: { name: github-pages }
    steps:
      - uses: actions/deploy-pages@v4
```

`BASE_PATH` må samsvare med adressen appen ligger under (for eksempel `/sokskart/`).
Appen kan også legges på en hvilken som helst webserver som serverer `dist/` over HTTPS.
HTTPS kreves for installasjon som app og for egen posisjon.

## Kort brukerveiledning

1. **Aksjon:** Skriv navn eller SAR-nummer. Velg én eller flere savnetkategorier. Med flere
   kategorier settes vektingen i blandingen. Fyll inn tidspunkt sist sett og UTM-sone
   (*Auto* viser det samme som en GPS).
2. **IPP:** Trykk «Sett IPP i kart» og klikk i kartet, eller skriv
   `32V 0463563 6833857` eller `61.6363, 8.3125`. IPP flyttes normalt ikke underveis.
   Appen ber om bekreftelse, og advarer ekstra hvis søk er registrert.
3. **Hent stier og veier** (krever nett). Ledelinjene rangeres og de øverste får L-nummer
   i fanen Ledelinjer. Høydedata fra Kartverket hentes automatisk.
4. **Tidslinja** nederst i kartet viser hvor personen kan være hvis hen har gått *t* timer.
   Det lilla området er det personen kan ha nådd. De lilla linjene er stier og veier
   personen kan ha fulgt, og de gule prikkene viser hvor langt ut hen kan være kommet.
   Trykk ▶ for å se det vokse fra IPP, og «Nå» for å følge tiden siden sist sett.
5. **Teiger:** Tegn teig (T), helikoptersøk (H) eller droneområde (D). Sett status
   (planlagt eller utdelt) og registrer søk med etat, ressurstype, id og POD. Fargene følger
   veilederen: blå planlagt, rød utdelt, oransje ett søk, gul flere søk, grønn POD > 95 %.
6. **Punkter:** Observasjon eller spor (sikker, sannsynlig, mulig, usikker), sperrepost
   (SP), refleks/POI (R) og funn (F). Sikre og sannsynlige observasjoner blir nye
   utgangspunkt i sannsynlighetskartet.
7. **Ressurser:** Oppgi antall fotmannskap, hundeførere, droner, ATV-er og biler. Appen
   foreslår like mange punkter å sjekke, og forslagene kan lastes ned som GPX.
8. **Lagre/åpne aksjon** som JSON for å dele den, og **GPX til mannskap** for IPP, punkter,
   teiger og prioriterte ledelinjer.
9. **Kartlag** (øverst til høyre): plankart, resultatkart og etterretningskart kan slås av
   og på hver for seg. IPP og ringene vises i alle tre. Her er også *Min posisjon* og
   *Last ned oversiktskart*.

Aksjonen lagres fortløpende på enheten og overlever omlasting.
**Slett aksjonen helt** (fanen Aksjon) fjerner alle lokale data.

## Teknologivalg

- **Vite + TypeScript + React.** Rask utvikling og statisk bygg, og typene fanger feil i
  tall og koordinater.
- **Leaflet + Leaflet-Geoman.** Kartverkets kart er bildefliser (WMTS), og Leaflet er lett,
  stabilt og fungerer godt på nettbrett. Geoman gir tegning og redigering av teiger.
  MapLibre ville ikke gitt noe ekstra for rasterkart.
- **Web Worker** for sannsynlighet og gangtid (Dijkstra over rundt 90 000 celler), slik at
  kartet ikke henger.
- **IndexedDB** (`idb-keyval`) for lokal lagring av aksjon, stier og høydedata.
- **vite-plugin-pwa (Workbox)** gjør appen installerbar og brukbar uten nett.
- **Egen UTM-implementasjon** (Krüger-serier til 6. orden). Den er testet mot PROJ for
  kjente punkter i sone 32, 33 og 35, også når sonen er tvunget langt fra
  sentralmeridianen.
- **geotiff.js** leser høydedata fra Kartverket.

## Datakilder og vilkår

| Kilde | Bruk | Vilkår |
|---|---|---|
| Kartverket topo og gråtone (WMTS-cache), `https://cache.kartverket.no/v1/wmts/1.0.0/{topo,topograatone}/default/webmercator/{z}/{y}/{x}.png` | Grunnkart | CC BY 4.0, «© Kartverket». Ifølge [vilkårene](https://www.kartverket.no/api-og-data/vilkar-for-bruk) inneholder nivå 12–20 data fra Geovekst, som krever særskilt løyve for kopiering. Søkskart forhåndslaster derfor bare nivå 8–11. Detaljnivå lagres bare når de vises. Spør Kartverket (post@kartverket.no) om løyve hvis dere trenger mer. |
| OpenStreetMap-fliser (reserve) | Grunnkart | © OpenStreetMap-bidragsytere (ODbL). Masse-nedlasting er ikke tillatt, så de forhåndslastes ikke. |
| Overpass API (`overpass-api.de`, reserve `overpass.private.coffee`) | Stier, veier, vann, myr, bre, stup, hytter | Én spørring per trykk, aldri i løkke. Resultatet lagres i aksjonen og sendes med i aksjonsfila. |
| Kartverket høydemodell (DTM), WCS `https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-258{32,33,35}`, coverage `nhm_dtm_topo_258xx` | Helning og hav i gangtiden | CC BY 4.0. Hentes som GeoTIFF for beregningsområdet og lagres lokalt. |

Kildene vises nederst til høyre i kartet. URL-ene ble sjekket 22.11.2026 (svarer med CORS).
Kartverkets egen tjenesteside for cache-tjenesten var ikke tilgjengelig, så sjekk
[register.geonorge.no/varsler](https://register.geonorge.no/varsler) for endringer.

*Turrutebasen* (merkede stier) er planlagt i fase 2. API-et dokumenteres da.

## Personvern

Opplysninger om den savnede er personopplysninger. Søkskart har ingen server, ingen
sporing og ingen analyseverktøy. Alt lagres lokalt i nettleseren (IndexedDB). Deling skjer
bare ved at noen eksporterer en aksjonsfil eller GPX. Aksjonsfiler (`*.aksjon.json`) er
lagt i `.gitignore`. Del dem bare på plattformer dere har godkjent (veileder kap. 5.2), og
slett dem når de ikke lenger trengs.

## Statistikk (Lost Person Behavior)

Tallene ligger i [src/data/lpb-stats.ts](src/data/lpb-stats.ts) og er plassholdere fra
prototypen (`verifisert: false`). Appen viser advarsel for hver kategori som ikke er
verifisert. Legg inn tallene fra boka i fanen Statistikk, eller importer CSV:

```
kategori;terreng;r25;r50;r75;r95;gangfart;mobilitet;verifisert;kilde
dement;fjell;0,3;0,8;1,9;8,3;1,5;12;ja;LPB 2008 tabell …
```

`terreng` kan være `fjell`, `flatt` eller tom (begge). Bruk «Eksporter CSV (mal)» for å
få alle kategoriene.

## Struktur

```
src/
  domain/     UTM, koordinattolking, avstand/areal, POD/POS, navngiving, aksjonsfil, GPX
  data/       LPB-statistikk, modellantakelser, CSV-import
  model/      rutenett, gangtid (Tobler), sannsynlighet, rangering, ressursforslag, worker
  services/   Overpass, Kartverket høydedata, kartfliser, lokal lagring
  state/      tilstand (Zustand), handlinger, kobling til worker
  map/        Leaflet-kart og egne kartlag
  ui/         faner, tidslinje, kartkontroller, formatering
docs/
  modell.md   sannsynlighetsmodellen
  instruks.md oppdraget
  prototype-sok-kart.html   den opprinnelige prototypen
```

Alle tall som vises (POA, POD, POS, areal, avstander, tider), og UTM-konvertering begge
veier, har enhetstester (`*.test.ts` ved siden av koden).

## Status

Fase 1 er på plass, og i tillegg:

- gangtid i terrenget med høydedata (opprinnelig fase 2)
- tidslinje med voksende ledelinjer
- ressursforslag
- observasjoner som nytt utgangspunkt
- enkel aksjonslogg

Gjenstår fra fase 2: Turrutebasen, import av GPX-spor med dekning og foreslått POD,
regioner med Mattson konsensus, visning av kvalitetssikring, tidslinje for observasjoner,
savnetprofil og 5-punktsordre. Fase 3 startes ikke uten avklaring.
