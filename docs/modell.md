# Sannsynlighetsmodellen i Søkskart

Søkskart er et **støtteverktøy**. Modellen under setter tall på statistikk og antakelser,
men POA og POD blir ikke mer nøyaktige av at de har en tallverdi (veileder kap. 7.5).
Søksledelsen tar beslutningene. Etterretning trumfer alltid statistikk.

Alle vekter og faktorer som ikke kommer fra HRS, er **modellantakelser**. De ligger i
[`src/data/modellantakelser.ts`](../src/data/modellantakelser.ts), kan endres i appen
(Statistikk → Modellantakelser), lagres i aksjonsfila og er merket «Modellantakelse» i
grensesnittet.

Beregningen går i en Web Worker ([`src/model/worker.ts`](../src/model/worker.ts)), slik at
kartet ikke henger mens den regner. Hele løpet står i
[`src/model/beregning.ts`](../src/model/beregning.ts).

## 1. Rutenett

- Kvadratisk rutenett med IPP i midtcella, akseparallelt i UTM (EPSG:25832/25833/25835).
- Halv bredde = R95 × 1,5 (`omradeFaktor`), avrundet opp til 500 m, mellom 2 og 30 km.
- Standard 301 × 301 celler (`rutenett`; oddetall, slik at IPP ligger midt i ei celle).
  For en turgåer (R95 11,3 km) blir cellene ca. 113 m.
- Avstander og areal korrigeres for UTM-målestokkfaktoren.
- Kartet tegnes i Web Mercator. Hver skjermpiksel slås opp i riktig UTM-celle, slik at
  rutenettet ikke forskyves av meridiankonvergensen.

## 2. Avstand fra IPP (statistikk)

For hver kategori fordeles sannsynligheten etter R25/R50/R75/R95 fra Lost Person Behavior:

| Bånd | Andel |
|---|---|
| 0 – R25 | 25 % |
| R25 – R50 | 25 % |
| R50 – R75 | 25 % |
| R75 – R95 | 20 % |
| utenfor R95 | 5 %, eksponentielt avtagende (lengdeskala `haleFaktor` × R95 = 0,3 × R95) |

Innenfor hvert bånd er sannsynligheten jevnt fordelt på arealet. Feltet glattes svakt med
et 3 × 3 boksfilter (`glatting` = 2 pass).

**Flere kategorier** (f.eks. dement fisker) kombineres som en vektet blanding av
fordelingene: p(d) = Σ wₖ pₖ(d). Vektene settes i Aksjon-fanen (standard lik vekt).
Ringene R25–R95 som vises, er kvantilene til blandingen og regnes ut numerisk. Gangfart og
mobilitetstid vises som vektet snitt. I rekkevidden brukes hver kategoris egne verdier.

Statistikken ligger i [`src/data/lpb-stats.ts`](../src/data/lpb-stats.ts) med egne sett for
fjell og flatt terreng. Tallene er plassholdere (`verifisert: false`) til de er kontrollert
mot boka.

## 3. Gangtid i terrenget

Gangtiden fra IPP regnes som korteste tid gjennom rutenettet (Dijkstra med 16 naboer:
8 naboer + springerhopp, som gir under 3 % retningsfeil). Se
[`src/model/gangtid.ts`](../src/model/gangtid.ts).

Fart i hver celle, som andel av kategoriens gangfart (som gjelder på sti):

| Terreng | Faktor | Felt |
|---|---|---|
| Sti, traktorvei, vei (OSM) | 1,0 | – |
| Kraftgate | 0,8 | `kraftgatefaktor` |
| Terreng utenfor sti | 0,6 (Tobler) | `terrengfaktor` |
| Myr og bre (OSM) | 0,4 | `myrfaktor` |
| Vann (OSM), hav (høyde 0 i DTM), elv, stup | 0 (barriere) | `elvErBarriere` |
| Brattere enn 35° utenfor sti | 0 (barriere) | `maksHelning` |

Stier og veier overstyrer barrierer, så bruer og stier gjennom stup fungerer.

**Helning:** Toblers gangfunksjon, regnet relativt til flatt terreng:
f(S) = exp(−3,5 · |S + 0,05|) / exp(−3,5 · 0,05), der S = høydeforskjell / horisontal
avstand i bevegelsesretningen. Slak nedoverbakke går raskest, og bratt opp går sakte.
Høydedata hentes fra Kartverkets høydemodell (DTM, WCS). Uten høydedata regnes terrenget
som flatt.

Resultatet er timer ved 1 km/t. Gangtiden for en kategori er dette delt på gangfarten.
**Tidslinja** i kartet viser området og ledelinjene personen kan ha nådd hvis hen har gått
i *t* timer. Gule prikker viser hvor langt ut langs hver sti og vei hen da kan være.

## 4. Rekkevidde

Når tidspunkt sist sett er oppgitt, er tilgjengelig gangtid

    t_tilgj = effektiv fremdrift × min(tid siden sist sett, mobilitetstid)

(`effektivFremdrift` = 0,6). Celler som krever mer gangtid enn dette, får raskt
avtagende vekt: exp(−((t − t_tilgj) / (0,2 · t_tilgj + 0,05 t))²) (`rekkeviddeMyk`).
Celler som ikke kan nås til fots, får vekt 0,02 (`uoppnaaeligVekt`).

Ringen «Mulig rekkevidde i rett linje» er prototypens formel:
gangfart × min(tid, mobilitet) × effektiv fremdrift.

## 5. Ledelinjer

Stier, traktorveier, veier, elver, bekker, grøfter og kraftgater fra OpenStreetMap.
OSM-veistykker slås sammen til sammenhengende linjer der to stykker av samme type og navn
møtes uten kryss.

| | Standard |
|---|---|
| Celler nær ledelinje (innen `naerM`) | vekt × 3 (`vektNaer`), 60 m |
| Celler i korridoren (innen `korridorM`) | vekt × 1,6 (`vektKorridor`), 200 m |

Ledelinjene **rangeres** etter summen av sannsynlighet (POA nå) i cellene de går gjennom.
De øverste (`antallLedelinjer` = 20) får et fast L-nummer første gang de kommer på lista.
Nummeret beholdes selv om rekkefølgen endres senere.

## 6. Vann

Celler i innsjøer og elver (OSM) får vekt 0,2 (`vannVekt`), og havet 0,02 (`havVekt`).
Søkskart er laget for søk på land.

## 7. Observasjoner

Veilederen (kap. 5.3) sier at en *sikker* observasjon skal føre til omprioritering og nytt
utgangspunkt. En *sannsynlig* kan bli utgangspunkt i tillegg til den opprinnelige planen.
En *mulig* er ikke spesifikk nok til å omprioritere, og en *usikker* bør ikke gi
omprioritering.

- **Sikker og sannsynlig** legger til en egen sannsynlighetsfordeling rundt observasjonen.
  Andelen er w / (w + K) av totalen, med w = 6 (sikker) eller 3 (sannsynlig) og K = 3
  (`obsAndelK`). Det gir 67 % for sikker og 50 % for sannsynlig. Fordelingen spres etter
  **gangtid fra observasjonen** (egen Dijkstra fra punktet), som en gauss i tid med
  spredning σ = max(150 m, gangfart × effektiv fremdrift × timer siden observasjonen × 0,6),
  regnet om til tid. Ledelinje- og vannvektene brukes også her.
- **Mulig** vekter bare lokalt: p × (1 + 1 · gauss) med samme spredning i meter.
- **Usikker** har vekt 0 og påvirker ikke kartet.

Flere observasjoner: p = (grunnfordeling + Σ rᵢ Gᵢ) / (1 + Σ rᵢ), der rᵢ = wᵢ / K.

## 8. Normalisering, søk og POS

1. Alt over normaliseres til 100 %. Dette er **POA før søk** (prior).
2. For hver teig ganges sannsynligheten i teigen med (1 − akkumulert POD), der
   akkumulert POD = 1 − (1 − POD₁)(1 − POD₂)…
3. Det som ble borte, er **søkt bort (POS)** = Σ POA × POD. Resten normaliseres på nytt
   til **POA nå**.

Eksempel fra veilederen: R25 har POA 25 %. Hund med POD 50 % gir 12,5 % igjen.
Søkekjede med POD 70 % gir 3,75 % igjen. Dette er dekket av enhetstester.

## 8b. Regioner og Mattson konsensus

Regioner (REGA, REGB …) er områder med tilnærmet lik POA (veileder 7.5). En celle som ligger
i flere regioner, hører til den første. Hver deltaker i ILKO fordeler poeng på regionene og
«resten» utenfor alle regioner. Poengene normaliseres til 100 % per deltaker, og snittet
blir konsensus-POA (veilederen: «gjennomsnittet av hva hver enkelt mener»).

Når minst én deltaker har vurdert, skaleres sannsynligheten i hver region slik at regionens
sum blir lik konsensus. Modellen bestemmer fordelingen *inne* i regionen. Har modellen
ingenting i en region, fordeles konsensus jevnt på arealet. Søk virker deretter som før.
Uten vurderinger vises modellens POA per region til sammenligning.

## 8c. Dekning og POD fra GPS-spor

For importerte spor regnes dekning C = Σ (W · L) / A, der W er effektiv søkebredde for
ressurstypen, L er sporets lengde inne i teigen og A er teigens areal. Foreslått POD er
1 − e^(−C), den eksponentielle deteksjonsfunksjonen fra søketeori (Koopman, Koester m.fl. 2004).
Brukeren godkjenner eller justerer forslaget før søket registreres. Spor som er brukt i et
registrert søk, telles ikke igjen for samme teig.

| Ressurs | Søkebredde W (`sokebredde`) |
|---|---|
| Søksmannskap til fots | 30 m |
| Hund | 80 m |
| Hundefører | 30 m |
| Drone | 60 m |
| Helikopter | 150 m |
| Motorisert | 20 m |

Søkebreddene er modellantakelser («moderate» standardverdier valgt av brukeren). Når både
hund og hundefører har spor i teigen, telles begge.

## 8d. Kvalitetssikring

Ved avslutning uten funn (veileder 7.5.2) viser appen teiger som **berører** R50 og ikke har
akkumulert POD over 95 %, og teiger som berører R75 og ikke har minst 50 % (normal høy).
Teiger med POA nå over 1,5 × snittet av teigene markeres som «markert høyere gjenstående
POA». Faktoren 1,5 er en modellantakelse. Appen viser også hvor mye av POA nå som ligger
utenfor alle teiger.

## 8e. Tidslinje og observasjoner

For hver observasjon sammenligner tidslinja gangtiden fra IPP til observasjonen (med
kategoriens gangfart) med tiden mellom sist sett og observasjonen. Krever observasjonen mer
enn 5 % raskere fremdrift enn mulig, får den en gul markering, og appen ber om ny vurdering
av observasjonen, IPP eller tidspunktet.

## 9. Fargebånd og mest sannsynlige punkter

- Cellene sorteres etter POA nå. Båndene viser **minste areal** som dekker 25, 50, 75
  og 95 % av sannsynligheten (mørk rød → lys oransje).
- **Mest sannsynlige punkter**: de høyeste cellene med minst max(R25, 300 m) mellom seg.

## 10. Ressursforslag

Brukeren oppgir antall enheter per type. Appen foreslår like mange punkter per type:

| Ressurs | Mål |
|---|---|
| Fotmannskap | IPP (akslingen), stier, punkter av interesse, områder med høy sannsynlighet |
| Hundefører | IPP (sporutgang), områder med høy sannsynlighet (grovsøk) |
| Drone | IPP, deretter ledelinjer (helst elv/bekk og kraftgate), så risikoområder (vann, myr, bre, stup) |
| ATV | Traktor- og skogsveier |
| Bil | Veier |

En ledelinje foreslås søkt **ut til punktet personen kan ha nådd** innen valgt gangtid
(tidslinja). Scoren er sannsynligheten langs den delen. Typene velger etter tur. Et mål en
annen type allerede har fått, teller halvt, og samme type får ikke to punkter nærmere enn
max(300 m, 2 celler). Reglene er avklart med brukeren og bygger på veilederens kap. 6.3.
De er modellantakelser.

## Kjente begrensninger

- Statistikken er plassholdere til den er kontrollert mot Lost Person Behavior.
- OSM mangler mange småstier, grøfter og åkerkanter (veileder 7.3.9).
- Rutenettet er grovt (ca. 100 m celler for R95 ≈ 11 km). Smale stier og bekker tegnes
  inn med minst én celles bredde.
- Gangtiden antar målrettet gange. Den tar ikke hensyn til vær, mørke, snø eller tilstanden
  til personen ut over gangfart og mobilitetstid for kategorien.
- R-verdiene fra LPB er avstand i rett linje. Gangtidsgrensen og den statistiske
  avstandsfordelingen er to forskjellige ting som her kombineres.
