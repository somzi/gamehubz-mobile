# OTA revizije: 3.1.0-r1, 3.1.0-r2, ...

Za JS/asset quick fix ostavi `expo.version` u `app.json` na verziji instaliranog
build-a (trenutno `3.1.0`). `runtimeVersion.policy` ostaje `appVersion`.

U Windows PowerShell-u objavljuj kroz `npm.cmd`:

```powershell
npm.cmd run update:ota -- --channel production --message "Ispravka prikaza rezultata"
```

`npm` u nekim PowerShell/npm verzijama pokrece `npm.ps1`, koji proguta `--`
separator i opcije. Ako vidis `Unexpected argument 'production'`, koristi
`npm.cmd` kao iznad. Na macOS/Linux koristi `npm` umesto `npm.cmd`.

Komanda rezervise sledeci broj iz `ota-revisions.json`, izvozi sveze bundle-ove
i pokrece EAS Update. Prva objava je `3.1.0-r1`, sledeca `3.1.0-r2`, itd.
Oznaka se upisuje u Expo `extra.otaRelease` i na pocetak EAS publish poruke.
Android i iOS iz iste objave dobijaju istu reviziju.

Za pregled sledece oznake bez izmene fajlova ili objave:

```powershell
npm.cmd run update:ota -- --channel production --message "Provera" --dry-run
```

- Podrzani kanali: `production`, `preview`, `development`. EAS environment po
  pravilu prati kanal; moze da se zada preko `--environment`.
- Podrazumevano se objavljuju obe platforme. Za jednu dodaj `--platform ios`
  ili `--platform android`. Za CI dodaj `--non-interactive`.
- Potrebni su npm i EAS autentikacija. Skripta koristi `npm exec` za EAS CLI
  (preuzima ga u npm cache ako nedostaje).
- Za numerisana izdanja koristi ovu komandu umesto direktnog `eas update`.
  Direktna komanda ne povecava brojac. Obican store build ga takodje ne povecava.

## Kada se oznaka vidi

Podesavanja i O nama prikazuju `3.1.0-r1` tek kada se taj OTA update stvarno
pokrene. Samo preuzimanje narednog update-a ne menja oznaku. Cita se metadata
trenutno pokrenutog update-a, pa i povratak na stariji OTA prikazuje njegov broj.

Bundle ugradjen u store build, povratak na njega i lokalni razvoj prikazuju samo
osnovnu verziju. OTA bez validne revizije koristi kratak Update ID kao rezervni
prikaz. Puni Update ID je i dalje dostupan kroz postojecu OTA dijagnostiku.

## Cuvanje brojaca

Pre objave preuzmi najnovije izmene repozitorijuma. Posle objave commituj
`ota-revisions.json` uz ostale izmene da bi sledeca objava nastavila brojanje.
Brojac je zajednicki za kanale/platforme unutar iste osnovne verzije.
Objavljujte iz jednog uskladjenog checkout-a / CI toka: lokalni lock sprecava
paralelne objave iz istog foldera, ali ne uskladjuje razlicite racunare.

Rezervisan broj se ne vraca ni kada objava ne uspe ili bude prekinuta: EAS je
mozda vec prihvatio deo objave. Commituj brojac i tada; sledeci pokusaj koristi
sledeci broj, pa su praznine u nizu dozvoljene. Ako je proces nasilno prekinut,
ukloni `.ota-publish.lock` tek posto potvrdis da vise ne radi.

Za novi native/store build promeni osnovnu verziju, npr. na `3.2.0`.
Njegova prva OTA objava automatski krece od `3.2.0-r1`; stari brojaci ostaju
sacuvani za eventualne ispravke starijih verzija.

`X-App-Version` i provera minimalne podrzane verzije koriste osnovnu verziju
bez `-rN` sufiksa. Native izmene i dalje zahtevaju novi kompatibilan build.

Provere u PowerShell-u: `npm.cmd run test:ota` i `npx.cmd tsc --noEmit`.

Expo reference: [runtime verzije](https://docs.expo.dev/eas-update/runtime-versions/)
i [Expo config iz aktivnog manifesta](https://docs.expo.dev/versions/v54.0.0/sdk/constants/#expoconfig).
