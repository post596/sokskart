# Instruks til Claude Code: Søkskart – planleggingsverktøy for søk etter savnet person på land

Du skal bygge et kartverktøy for søk og redning (SAR). Det brukes av frivillige i Norsk Folkehjelp og i ILKO (innsatsleders kommandoplass). Verktøyet setter IPP i kartet, viser statistiske søksringer, finner og rangerer stier og veier som personen kan ha fulgt, og viser hvor personen mest sannsynlig befinner seg. Det oppdateres fortløpende når det kommer inn nye observasjoner og søk.

Språk i hele brukergrensesnittet: **norsk bokmål**. Kode, kommentarer og commit-meldinger kan være på engelsk.

En fungerende prototype i én HTML-fil følger med (`sok-kart.html`). Les den først. Den viser modellen, begrepene og fargekodene vi vil ha, men den skal skrives om til et ordentlig prosjekt.

---

## 1. Fagkilder (må følges)

1. **Nasjonal veileder for søk etter savnet person på land (HRS, 2022)**
   https://www.hovedredningssentralen.no/wp-content/uploads/2023/01/Veileder-sok-etter-savnet-pa-land-2022.pdf
2. **Redningshåndboka (HRS, 2024)**
   https://www.hovedredningssentralen.no/wp-content/uploads/2024/04/Redningshandboka-i-ny-kapittelstruktur-pdf.pdf
3. **Håndbok for redningstjenesten, nivå 1 (HRS, 2024)**
   https://www.hovedredningssentralen.no/wp-content/uploads/2024/09/Handbok-for-redningstjenesten_niva-1_2024_sider_en-side-per-side.pdf
4. **Lost Person Behavior** (Robert J. Koester): statistikk per savnetkategori. Boka er ikke fritt tilgjengelig. Brukeren legger inn tallene selv (se punkt 5).

Begreper, navngiving og fargekoder skal følge HRS-veilederen. Ikke finn på egne begreper der veilederen allerede har et.

---

## 2. Viktige regler fra veilederen som appen skal bygge inn

- **IPP flyttes normalt ikke** underveis. Statistikken bygger på IPP, så feil IPP gir feil bruk av statistikken. Nye observasjoner skal *vekte* områder, ikke flytte IPP. Appen skal advare hvis brukeren prøver å flytte IPP etter at søk er registrert.
- **Sykkelhjulmodellen** (førsteinnsats, normalt opptil 12 timer):
  - Akslingen: IPP søkes grundig
  - Navet: R25, umiddelbart søk i nærområdet (finsøk hvis R25 < 300 m)
  - Eikene: ledelinjer (stier, veier, elver, bekker, grøfter), hurtigsøk som går lengre enn arealsøket, og helt ut, også forbi R95 når tid og scenario tilsier det
  - Felgen: R50/R75, søksområde og sperreposter
  - Refleksene: POI og risikoområder
- **Ringer:** R25, R50, R75 og R95 rundt IPP. R95 skal ikke styre førsteinnsatsen.
- **Observasjoner** klassifiseres som *sikker*, *sannsynlig*, *mulig* eller *usikker*. Bare sikre og sannsynlige skal normalt føre til omprioritering.
- **POD-skala:**

  | POD | Betegnelse |
  |---|---|
  | > 95 % | Svært høy (teigen regnes som ferdig avsøkt) |
  | 75–95 % | Høy |
  | 50–75 % | Normal høy |
  | 25–50 % | Normal lav |
  | < 25 % | Lav |

- **Formler:**
  - POS = POA × POD
  - Akkumulert POD = 1 − (1 − POD₁)(1 − POD₂)…
- **Teiger:** typisk 0,2–0,5 km². Alle aktører må bruke samme teigsett.
- **Regioner:** områder med lik POA, maks 20–30 i et søksområde. POA fordeles med **Mattson konsensus** (snittet av hvert ILKO-medlems vurdering).
- **Kvalitetssikring:** ved avslutning uten funn kan det kreves at teiger innenfor R50 har POD > 95 % og teiger innenfor R75 normalt høy POD. Appen skal kunne vise hvilke teiger som ikke oppfyller kravet.
- **Navngiving:** T### teig, L### ledelinje, R### refleks/punkt, H### helikoppersøk, D### drone, SP### sperrepost, REGA/REGB … regioner.
- **Fargekoder for teiger/oppdrag:** blå = planlagt, rød = utdelt og startet, oransje = ett søk, gul = flere søk (bør vurderes på nytt), grønn = POD > 95 %.
- **Sporfarger:** fotmannskap rød, hund mørk grå, hundefører blå, motorisert grønn.
- **Koordinater:** på land alltid **UTM i WGS 84**. Vis sone og bånd, f.eks. `32V 0526873 6785167`. Funnposisjon skal kunne kopieres som 14-sifret UTM-referanse. Støtt også inntasting av desimalgrader.
- **Tre kartlag:** plankart, resultatkart og etterretningskart. IPP og ringene skal vises i alle tre.

---

## 3. Målgruppe og plattform

> **Avklar med meg før du starter** hvis noe her er uklart. Standardvalgene under gjelder hvis jeg ikke sier noe annet.

- **Primær bruker:** søksplanlegger i ILKO på PC eller nettbrett.
- **Sekundær bruker:** lagleder på mobil i felt (se kart, teig, ledelinjer og egen posisjon, og registrere observasjoner).
- **Plattform:** web-app som PWA, slik at den kan installeres på PC og mobil og fungere **uten nett** med kart lastet ned på forhånd.
- **Teknologi (forslag):** Vite + TypeScript + React, Leaflet (eller MapLibre GL hvis du har god grunn), Web Worker for sannsynlighetsberegningen og IndexedDB for lokal lagring. Begrunn valget kort i README.
- **Ingen server i første versjon.** Alt lagres lokalt. Deling skjer via eksport og import av aksjonsfil og GPX.

---

## 4. Funksjoner

### Fase 1 – grunnmur (gjør først)
1. Prosjektoppsett, linting, enhetstester (Vitest) og README med oppstart.
2. Kart med Kartverket topo og gråtone (WMTS) og OpenStreetMap som reserve. Målestokk og UTM-koordinat under musepekeren eller sentrumskorset.
3. **Aksjon:** navn/SAR-nummer, savnetkategori (én eller flere), tidspunkt sist sett, valg av UTM-sone (auto/32/33/35).
4. **IPP:** sett med klikk, skrevet UTM eller grader. Viser R25/R50/R75/R95 og rekkevidde (gangfart × tid, begrenset av mobilitetstid × effektiv fremdrift).
5. **Ledelinjer:** hent stier, traktorveier, veier, elver, bekker, grøfter og kraftgater fra OpenStreetMap (Overpass API) innenfor R95, med et tak som kan stilles inn. Vis dem fargekodet og ranger dem (L001 …) etter hvor mye sannsynlighet de går gjennom.
6. **Sannsynlighetskart** (se punkt 6) med fargebånd for minste areal som dekker 25/50/75/95 % sannsynlighet, og en liste over de mest sannsynlige punktene med UTM.
7. **Teiger:** tegn, rediger og slett. Status planlagt/utdelt. Registrer søk med ressurstype, POD og tidspunkt. Vis areal, POA før og nå, akkumulert POD og fargekode.
8. **Punkter:** observasjon/spor (med klassifisering og tidspunkt), sperrepost, refleks/POI og funn av gjenstand. Sikre og sannsynlige observasjoner vekter sannsynlighetskartet.
9. **Sykkelhjul-sjekkliste** for førsteinnsatsen.
10. **Lagre/åpne aksjon** som JSON og **eksport av GPX** (IPP, punkter, teiger, prioriterte ledelinjer) til mannskapenes GPS.

### Fase 2 – bedre modell og arbeidsflyt
11. **Høydedata fra Kartverket:** bruk terrenghelling til å regne rekkevidde (f.eks. Toblers gangfunksjon) i stedet for rett linje. Bratte områder og store vann blir barrierer.
12. **Turrutebasen** (Kartverket/Geonorge) som ekstra kilde til merkede stier.
13. **Import av GPX-spor** fra mannskap, hund, drone og helikopter. Beregn dekning i teigen ut fra søkebredde og foreslå POD. Brukeren godkjenner eller justerer.
14. **Regioner og Mattson konsensus:** flere personer legger inn vekting per region, og appen bruker snittet som POA.
15. **Kvalitetssikring:** vis teiger innenfor R50/R75 som ikke oppfyller POD-kravet, og teiger med høy gjenstående POA.
16. **Tidslinje** for observasjoner og søk. Aksjonslogg med tidsstempel for alle endringer.
17. **Savnetprofil:** navn, beskrivelse, kategori, statistiske hovedpunkter og antatt scenario. Bilde er valgfritt og skal bare lagres lokalt.
18. **5-punktsordre** generert fra en teig eller ledelinje (situasjon, oppdrag, utførelse, administrasjon/forsyning, ledelse/samband), klar til å kopieres.

### Fase 3 – senere (ikke start uten å spørre)
- Deling i sanntid mellom ILKO og lag (krever server og personvernvurdering).
- Kobling mot drone-appen vår (live søk med drone), slik at dronespor blir D### i kartet.
- Flere modeller, som funnsteds-statistikk (bygning, vei, bekkedrag osv.) koblet mot N50-arealtyper.

---

## 5. Statistikk fra Lost Person Behavior

- Tallene skal ligge i en egen, redigerbar datafil (f.eks. `src/data/lpb-stats.ts` eller JSON). For hver kategori: R25, R50, R75, R95 (km), og helst egne sett for fjell og flatt terreng. Tabellen skal også ha gangfart (km/t), mobilitetstid (timer) og feltet `verifisert: boolean`.
- **Ikke finn på tall.** Bruk plassholderverdiene fra prototypen og merk dem `verifisert: false`. Appen skal vise en tydelig advarsel for hver kategori som ikke er verifisert.
- Lag et skjermbilde der brukeren kan legge inn og kontrollere tallene fra boka. Gi en enkel import av CSV.
- Hvis jeg sender bilder av tabellene i boka, legger du dem inn og setter `verifisert: true` per kategori.
- Kategorier (fra veilederens hurtigguide): demens, økt selvmordsrisiko, psykisk utviklingshemmet, autisme, rus, barn 1–3, 4–6, 7–9, 10–12 og 13–15 år, turgåer, jeger, bær-/soppplukker, fisker, skiløper langrenn og skiløper alpin.

---

## 6. Sannsynlighetsmodellen

Beregningen skal gå i en Web Worker og være dokumentert i `docs/modell.md`. Grunnmodellen er rutenett rundt IPP med cellestørrelse tilpasset R95 (ca. 300 × 300 celler):

1. **Avstand:** 25 % av sannsynligheten innenfor R25, 25 % mellom R25 og R50, 25 % mellom R50 og R75, 20 % mellom R75 og R95. Resten (5 %) avtar utenfor R95. Sannsynligheten er jevnt fordelt på arealet i hvert bånd og glattes svakt.
2. **Rekkevidde:** celler utenfor mulig rekkevidde (gangfart × min(tid, mobilitetstid) × effektiv fremdrift) får raskt avtagende vekt. Med høydedata (fase 2) regnes rekkevidden som gangtid langs terrenget.
3. **Ledelinjer:** celler nær ledelinjer (standard 60 m) får vekt × 3, og celler i korridoren (standard 200 m) får vekt × 1,6. Alle verdier kan stilles inn.
4. **Observasjoner:** gaussisk økning rundt observasjonen. Spredningen øker med tid siden observasjonen. Vekt: sikker 6, sannsynlig 3, mulig 1, usikker 0.
5. **Normaliser** til 100 % = POA-fordeling før søk.
6. **Søk:** for hver teig ganges sannsynligheten med (1 − akkumulert POD). Normaliser på nytt. Vis hvor mye som er søkt bort totalt (POS).

**Alle vekter i punkt 2–4 er forslag, ikke fra HRS.** De skal ligge i én innstillingsfil, kunne endres i appen og være merket som «modellantakelser» i grensesnittet.

---

## 7. Datakilder

- Kartverket topo og gråtone (WMTS), f.eks. `https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png`. **Sjekk at URL og vilkår er gjeldende.**
- OpenStreetMap via Overpass API (`overpass-api.de`, med reserve-endepunkt). Respekter bruksvilkårene: ikke send spørringer i løkke, cache resultatet per aksjon.
- Kartverket høydedata og Turrutebasen via Geonorge (fase 2). Finn gjeldende API-er og dokumenter dem i README.
- Navngi kildene i kartet (attribution).

---

## 8. Sikkerhet, personvern og robusthet

- Opplysninger om den savnede er personopplysninger. Lagre lokalt, ingen sporing og ingen tredjeparts analyseverktøy. Gi en knapp for å slette aksjonen helt.
- Appen må tåle dårlig nett: ingenting skal krasje hvis kart eller Overpass ikke svarer. Vis tydelig feilmelding og fortsett med det som finnes.
- Alle tall som vises (POA, POD, POS, areal, avstander) må ha enhetstester. Det gjelder også UTM-konvertering begge veier, testet mot kjente punkter i sone 32, 33 og 35.
- Vis tydelig i appen at den er et **støtteverktøy**. Søksledelsen tar beslutningene, og HRS sitt felles system for aksjonsstøtte er det offisielle systemet.

---

## 9. Design

- Rolig og tydelig: må kunne leses ute i sollys og på nettbrett i ILKO. Store trykkflater (minst 44 px) og høy kontrast.
- Norsk Folkehjelp-rød (`#c8102e`) som aksentfarge. Ellers skal HRS-fargekodene styre kartet.
- Sidepanel med faner (Aksjon, Ledelinjer, Teiger, Punkter, Statistikk) på PC. På mobil ligger kartet øverst og panelet under.

---

## 10. Arbeidsmåte

1. Les prototypen og fagkildene. Lag en kort plan med filstruktur og faser, og vis den til meg før du skriver mye kode.
2. Bygg fase 1 i små, testbare steg og commit etter hvert steg.
3. Kjør tester og bygg før du sier at noe er ferdig. Test også i nettleser med et IPP i norsk fjellterreng, f.eks. i Jotunheimen.
4. Når noe er uklart faglig (søksmetodikk), spør meg i stedet for å gjette.
5. Lever README med oppstart, bygg, deploy (f.eks. GitHub Pages) og en kort brukerveiledning på norsk.

### Ferdig med fase 1 når
- Jeg kan sette IPP, velge kategori og tid og se ringer, rekkevidde og sannsynlighetskart.
- Stier og veier hentes og rangeres, og topp-ledelinjene vises med L-nummer.
- Jeg kan tegne teiger, registrere søk med POD og se at sannsynligheten flytter seg.
- Observasjoner endrer kartet, og bare sikre og sannsynlige får stor vekt.
- Aksjonen overlever en omlasting av siden og kan eksporteres som JSON og GPX.
- Appen kan installeres som PWA og viser lagrede data uten nett.
- Alle tester er grønne.
