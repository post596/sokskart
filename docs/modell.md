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

**Funn av gjenstand** behandles som en observasjon med samme klasser. Et sikkert eller
sannsynlig funn blir altså nytt utgangspunkt. Funn registrert før dette ble innført, får
klassen «mulig» ved innlasting, fordi klassen ikke kunne velges for funn før.

## 8. Normalisering, søk og POS

1. Alt over normaliseres til 100 %. Dette er **POA før søk** (prior).
2. For hver teig ganges sannsynligheten i teigen med (1 − akkumulert POD), der
   akkumulert POD = 1 − (1 − POD₁)(1 − POD₂)…
3. Det som ble borte, er **søkt bort (POS)** = Σ POA × POD. Resten normaliseres på nytt
   til **POA nå**.

Eksempel fra veilederen: R25 har POA 25 %. Hund med POD 50 % gir 12,5 % igjen.
Søkekjede med POD 70 % gir 3,75 % igjen. Dette er dekket av enhetstester.

**Ferdig sjekket punkt og ledelinje** (`src/model/innsats.ts`). Etter teigsøkene ganges
sannsynligheten også med det som er igjen etter søkt innsats utenfor teiger:

- Sjekket punkt: en skive på 50 m med POD 80 %.
- Sjekket ledelinje: en korridor på 30 m til hver side med POD 50 % (hurtigsøk).
- POD i en celle = POD × andelen av cella som skiva eller korridoren dekker. Det virker
  for alle cellestørrelser.
- Arealet samples i rutenettet: skiva skaleres til nøyaktig πr², korridoren til 2 × bredde
  × lengde.
- En sjekket sperrepost påvirker ikke kartet.
- Det som fjernes, telles i POS.
- Alle fire tallene er modellantakelser.
- Merk bare det som er sjekket i egne oppdrag. Det som er dekket av et registrert teigsøk,
  telles ellers dobbelt.

## 8b. Regioner og Mattson konsensus (fjernet)

Regioner og Mattson-konsensus er tatt ut av Søkskart (november 2026). Gamle aksjonsfiler
lastes uten dem, med et varsel.

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

**Spor senker sannsynligheten i hele kartet** (`src/model/innsats.ts`). Hvert importert spor
regnes som en korridor med bredde W langs sporet:

- **Dekning per celle:** C = sveipet areal / celleareal, summert over sporene. Gjenværende
  andel blir e^(−C), altså POD = 1 − e^(−C) per celle. Dette ganges inn etter teigsøkene.
  Nye teigforslag går dermed til hullene der ingen har gått.
- **Ingen dobbelttelling:** et spor som er koblet til et registrert søk i en teig, telles
  ikke inne i den teigen, fordi søkets POD allerede dekker det. Utenfor teigen teller det
  fortsatt. Når søk registreres, kobles sporene i teigen som standard.
- **Ledelinjer:** en ledelinje regnes som søkt når minst 70 % av den ligger innenfor
  max(W/2, 25 m) fra et spor. Den merkes da «søkt (GPS-spor)» automatisk, og merket fjernes
  hvis sporet slettes. Slike linjer får ingen ekstra POD, fordi sporet allerede har gitt
  dekningen.
- **Visning:** per teig og per teigforslag vises «GPS-spor dekker ca. X %» (snitt av
  1 − e^(−C) i området, alle spor).
- **Begrensning:** POD forfaller ikke over tid. Et område som ble søkt for mange timer siden,
  regnes som like godt søkt, selv om personen kan ha beveget seg inn i det senere.

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

## 8f. Teigforslag, søketid og droneområder (fase 3)

**Søketid** for et fotlag: areal / (antall mannskap × avstand × søkefart × terrengfaktor).

- Terrengfaktoren er gangfarten i cella i forhold til åpent terreng, ganget med 0,7 i skog
  (`skogSokefaktor`).
- Helningen virker gjennom Toblers funksjon, som snitt av opp, ned og to ganger på tvers.
  Et søkslag går mest langs kotene.
- Bratt terreng over 35° kan ikke søkes til fots.
- Veilederen sier ikke noe om maks søketid. 2 timer og 0,9 km² er Norsk Folkehjelps praksis.

**Generatoren** (`src/model/teiggenerator.ts`):

1. Fint rutenett på 25 m.
2. Grenser fra ledelinjer, stup og skifte i arealtype.
3. Sammenhengende områder mellom grensene. **Sonen er ikke absolutt** (veileder 7.3.7): et område
   som krysser kanten av valgt sone (R25-sirkelen, 50 %- eller 75 %-sonen) beholdes helt ut til
   nærmeste naturlige grense, uansett avstand. Generatoren ser teknisk inntil 1,5 km utenfor
   sonen. Finnes ingen grense der, kuttes området ved sonen som før. Deler som etter
   delingen ligger helt utenfor sonen, blir ikke foreslått. «Hvorfor?» viser hvor stor del
   av teigen som ligger utenfor.
4. For store eller for tidkrevende områder deles med geodetisk k-means, der kostnaden er høy
   over rygger og i dalbunner (laplace av høydemodellen). Delelinjene legger seg dermed i
   terrengformer. Det er 15 % margin for grensecellene.
5. Biter under `minTeigKm2` slås sammen med en nabo bare når grensene fortsatt holdes.
   Kun biter under 0,01 km² slås alltid sammen.
   Grensecellene (et bånd på ca. 50 m langs hver linje) fordeles til naboteigene. Der mange
   stier og veier møtes, kan det gi mye ekstra areal, så teiger som da bryter tids- eller
   arealgrensen, deles på nytt.
6. Polygon langs cellekantene, forenklet (Douglas–Peucker) og glattet (Chaikin).

**Søksfase** (`src/domain/fase.ts`): Førsteinnsats varer til første grense (6 t), overgang
til andre grense (12 t), deretter formell søksplanlegging. Veilederen sier at førsteinnsatsen
normalt varer opptil 12 timer og at formell planlegging kommer etter 6–24 timer.

**Droneeffekt per arealtype** (modellantakelse):

| Arealtype | Effekt |
|---|---|
| Åpent, myr, bre | 1 |
| Strandsone, og terreng brattere enn 30° | 1 |
| Dyrket | 0,9 |
| Vann | 0,8 |
| Ukjent | 0,7 |
| Kratt | 0,6 |
| Skog | 0,2 |
| Bebygd | 0,1 |

Droneområder lages av celler med effekt på minst 0,5 innenfor 75 %-sonen, er 0,2–0,45 km² og
rangeres etter POA × effekt.

Flytid per område: areal / (søkebredde × fart), med søkebredde 60 m og 18 km/t, altså ca.
1,08 km² i timen. Antall batterier = flytid / 25 min, rundet opp. Maks 0,45 km² er valgt slik
at ett område kan flys på ett batteri. Alle fire tallene er modellantakelser. Generatoren
deler droneområder til 95 % av maks og slår aldri sammen over maks, slik at ett område aldri
krever to batterier.

**Begrunnelse per forslag** («Hvorfor dette forslaget?», `src/model/grunnlag.ts`). Når et
teig- eller droneforslag lages, oppsummeres cellene i hovedrutenettet innenfor omrisset:

- rang og POA (generatorens verdi), og kumulativ POA med forslagene foran
- arealandel i 25/50/75/95 %-sonen og utenfor
- korteste gangtid fra IPP og avstand fra IPP til nærmeste kant
- de tre største arealtypene fra OSM og snitthelning fra høydedata
- ledelinjer inni (lengde innenfor omrisset, minst 20 m) og interessepunkter inni
- for fotteiger: teknikk, søketid og snittfaktor for søkefart i terrenget
- for droneområder: snitt droneeffekt (score / POA), flytid og batterier
- søksfase og hvorfor antallet (f.eks. fotmannskap delt på lagstørrelse)

Begrunnelsen lagres på teigen når forslaget godkjennes, og vises i fanen Teiger.

**Interessepunkter** (`src/data/interessepunkter.ts`): vekt per punkttype per kategori,
blandet med kategorivektene. Score = POA innen 150 m × vekt. Punktene ligger minst 150 m fra
hverandre og fra eksisterende R-punkter.

## 8h. Sperreposter

En sperrepost (SP###) skal hindre at den savnede tar seg forbi (veileder 6.3.2) og er også
en utkikkspost. **Modellantakelse:**

- **Dekning**: en sirkel rundt posten (standard `sperrepostRadiusM` = 100 m, kan dras i kartet,
  25 m–1 km), eller et tegnet sperrefelt, f.eks. tvers over en dal.
- **I tide**: posten virker bare for den delen av kategoriblandingen som ikke kan ha passert
  før den ble satt opp. Satt opp t timer etter sist sett, når personen (fart v, effektiv
  fremdrift e) posten etter T1(post) / (v · e) timer. Andelen er summen av vektene for
  kategoriene der t er mindre enn denne tiden.
- **Bak posten**: gangtiden regnes på nytt med dekningen som sperre. Celler der den nye
  gangtiden er mer enn 1 % lengre (eller uendelig), og selve dekningen, ligger bak posten:
  raskeste vei dit går gjennom dekningen.
- **Virkning**: sannsynligheten bak posten ganges med 1 − `sperrepostPod` (standard 0,8) for
  kategoriene posten var i tide for. Sikre og sannsynlige observasjoner bak posten virker
  fortsatt, siden de viser at personen har passert.
- **Vekst i kartet**: for poster som virker for minst halve blandingen, stopper gangtidslaget
  og de voksende ledelinjene ved posten.
- En post der dekningen omfatter IPP, virker ikke. Høyst 8 poster tas med (én gangtid hver).
- Begrensning: posten regnes som bemannet fra «satt opp» og ut aksjonen.

## 9. Fargebånd og mest sannsynlige punkter

- Cellene sorteres etter POA nå. Båndene viser **minste areal** som dekker 25, 50, 75
  og 95 % av sannsynligheten (mørk rød → lys oransje).
- **Mest sannsynlige punkter**: de høyeste cellene med minst max(R25, 300 m) mellom seg.

## 10. Ressurser

Søkskart tar ikke imot ressurstall. Ressursstatus føres i FAKS. Appen anbefaler i stedet
ressurs og metode for hvert stisøk (se §10b).

## 10b. Anbefalt ressurs for stisøk

Hver ledelinje får en anbefalt ressurs og metode for søk langs linja (src/data/stisok.ts).
Reglene bygger på veileder kap. 6.3 og 7.3.10:

| Linjetype | Anbefalt | Alternativ | Kilde |
|---|---|---|---|
| Sti | Fotlag 1–3, hurtigsøk langs linja | Hund, helst før andre har gått linja | 6.3.2, 6.3.1 |
| Traktorvei | ATV med 2 personer, stopp og lytt | Fotlag, hund | 6.3.6 |
| Vei | Bil med 2 eller flere, lav fart, stopp og lytt | Fotlag med flanke ved skråninger | 6.3.6, 6.3.2 |
| Elv/bekk/grøft | Drone (elv- og strandsøk) | Fotlag langs bredden | 6.3.8, 7.3.10 |
| Kraftgate | Drone langs ryddebeltet | Fotlag | 6.3.8 |
| Jernbane | Drone | Fotlag (avklar med Bane NOR – praksis) | 6.3.8 |

- **Flanke** (1–3 på hver side) når en valgt kategori er demens, økt selvmordsrisiko eller
  barn (6.3.2: syke, selvmordsrisiko, barn som gjemmer seg).
- **Skiløpere**: snøskuter på løyper og traktorveier (6.3.6).
- **Tid**: hele linja delt på farten for anbefalt ressurs (modellantakelser
  stisokFotKmt, stisokFlankeKmt, stisokHundKmt, stisokAtvKmt, stisokBilKmt,
  stisokSkuterKmt; drone bruker droneFartKmt). Linja skal søkes helt ut (7.3.10).
- Anbefalingen står i Ledelinjer-fanen, i kortet for valgt linje og i 5-punktsordren.
  Søksleder vurderer. Søkskart registrerer ikke ressurser.

## Kjente begrensninger

- Statistikken er plassholdere til den er kontrollert mot Lost Person Behavior.
- OSM mangler mange småstier, grøfter og åkerkanter (veileder 7.3.9).
- Rutenettet er grovt (ca. 100 m celler for R95 ≈ 11 km). Smale stier og bekker tegnes
  inn med minst én celles bredde.
- Gangtiden antar målrettet gange. Den tar ikke hensyn til vær, mørke, snø eller tilstanden
  til personen ut over gangfart og mobilitetstid for kategorien.
- R-verdiene fra LPB er avstand i rett linje. Gangtidsgrensen og den statistiske
  avstandsfordelingen er to forskjellige ting som her kombineres.
