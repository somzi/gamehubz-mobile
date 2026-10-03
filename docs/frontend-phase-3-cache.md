# Faza 3 — stavka 12: keš i ponovljeni zahtevi

Implementirano 3. oktobra 2026. Ovaj paket obuhvata stavku 12 iz prvobitnog plana.

## Promene

- Pregled turnira, žreb, učesnici i potvrđeni/pending timovi koriste isti React Query klijent kao ostali ekrani. Ključevi odvajaju turnir, korisnika i resurs. Normalan povratak i promena taba koriste sveže podatke do 30 sekundi; paralelni čitaoci dele GET koji već traje.
- Postojeći pozivi posle akcija i Retry ostaju prisilno osvežavanje. Takav poziv otkazuje stariji GET pre potvrde, pa odgovor započet pre izmene ne može da potvrdi novo stanje. Notifikacija pri ulasku na turnir takođe traži sveže podatke.
- Početni pregled i prazne liste koriste isti rok kao popunjeni podaci. Neuspeh osvežavanja čuva sadržaj i ostavlja keš zastareo za naredni pokušaj.
- Profil huba proverava svežinu umesto poništavanja keša na svaki fokus. Učitavanje na mount-u i fokus dele isti zahtev. Skriveni profil ne pokreće automatski zahtev zbog invalidacije.
- Uspešne izmene huba, društvenih linkova, Discord podešavanja, članstva/uloga, kao i izmene/otkazivanje/brisanje turnira i radnje tima, poništavaju odgovarajući keš. Povratak sa upravljanja zato odmah proverava izmenjene podatke, i unutar roka svežine. Kreiranje turnira poništava listu turnira i podatke povezanog huba.
- Tournaments i Hubs koriste prozor svežine od 120 sekundi. Skriveni ekrani ne rade automatsko osvežavanje. Ručno povlačenje osvežava samo aktivan filter/pretragu, a stvarne izmene mogu poništiti sve povezane filtere.
- Učitavanje naredne stranice ne može da prekine osvežavanje liste. Povlačenje tokom učitavanja sledeće stranice otkazuje taj zahtev i stvarno osvežava postojeće stranice. AbortSignal je prosleđen mrežnim zahtevima.
- Zajednički fokus hook čita trenutno stanje keša i proverava invalidaciju i zahtev u toku. Promena `dataUpdatedAt`, callback-a ili render sama po sebi nije novi fokus; ne pokreće još jedan zahtev ili petlju ponavljanja. Home i Social koriste tačne ključeve svojih upita.
- Novi keš turnira ostaje u memoriji, sa GC rokom od pet minuta. Ne ulazi u AsyncStorage snapshot. Ostala politika trajnog keša pripada stavki 13.
- Kada meč vrati novu strukturu žreba uz uspešnu akciju, struktura se upisuje u isti keš; zakasneli raniji GET ne prepisuje taj rezultat.

## Paginirane liste

Sve učitane stranice i pozicija skrola ostaju sačuvane pri brzom povratku. Nema skraćivanja liste na prvu stranicu, ograničavanja broja dostupnih redova niti mešanja sveže prve stranice sa proizvoljno starim nastavkom.

Kada je lista zaista zastarela, eksplicitno poništena ili korisnik povuče osvežavanje, React Query i dalje usklađuje učitane stranice redom. To čuva granice stranica i sprečava preskakanje ili dupliranje nakon promena na serveru. Optimizacija smanjuje učestalost takvog osvežavanja i prekida osvežavanje skrivenih ekrana; ne ukida svaki puni refresh.

Keš ne odlaže lokalne uspešne izmene jer one odmah poništavaju podatke. Izmene sa drugog uređaja za koje nema push invalidacije mogu se videti tek pri narednom fokusu nakon isteka roka; ručno osvežavanje je odmah dostupno.

## Provere

- `npm run test:frontend`: **127/127**, uključujući 18 novih testova.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: prolazi.
- `git diff --check`: prolazi.
- Testovi koriste stvarni QueryClient i InfiniteQueryObserver, stvarni fokus hook sa kontrolisanim fokusom i stvarne callback-e ekrana. Broje zahteve, proveravaju 90 sekundi staru listu sa tri stranice, invalidaciju skrivenog ekrana, povratak nakon izmene, stariji GET tokom akcije, pull tokom paginacije i isključivanje novog keša iz trajnog snapshot-a.
- Lokalni Expo export za Android i iOS: prolazi za oba sistema (2.136 modula po platformi).
- Native proba na uređaju nije izvršena.

## Proba na telefonu

1. Otvoriti turnir, žreb i učesnike. Otići na profil pa brzo Back; sadržaj i izabrani tab ostaju. Ponoviti posle više od 30 sekundi i proveriti osvežavanje.
2. Otvoriti hub, otići na drugi ekran pa brzo Back. Zatim promeniti naziv/avatar/članstvo ili ulogu kroz upravljanje i vratiti se u roku od 30 sekundi: prikazuje se nova vrednost.
3. U Tournaments/Hubs učitati najmanje tri stranice, otvoriti detalje pa Back i menjati tabove u roku od dva minuta. Redovi i skrol ostaju. Povlačenje odmah osvežava aktivnu listu.
4. Promeniti filter ili pretragu; proveriti da se redovi i paginacija ne mešaju. Na sporoj mreži povući osvežavanje dok se učitava naredna stranica.
5. Prekinuti mrežu pri osvežavanju; postojeći sadržaj ostaje. Vratiti mrežu i ponoviti.
6. Promeniti rezultat/termin meča, tim ili postavke turnira i odmah se vratiti: izmena se vidi iako prethodni podaci još nisu istekli.
7. Otvoriti meč iz notifikacije, uključujući drugi meč dok je turnir već otvoren; proveriti da nova navigacija i prikaz meča rade kao ranije.

Ostatak faze 3 i faza 4 nisu obuhvaćeni ovim paketom.
