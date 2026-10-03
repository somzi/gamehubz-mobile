# Frontend: faze 1 i 2

Implementacija i regresione provere, 2. oktobar 2026. Izmene nisu objavljene.

## Faza 1

- **R1:** navigacija sa ekrana proverava da li je izvor još u fokusu. Nema globalne blokade od 500 ms; notifikacije i linkovi preko container-a ostaju dozvoljeni.
- **R2:** DM se prepoznaje po razgovoru ili sagovorniku. Parametri se dopunjavaju čim se sazna identitet; kasno razrešene duple rute spajaju se uz čuvanje vidljive instance, nacrta i reda slanja iz obe kopije.
- **28 / 27, deo:** testovi routera i prelaza, ograničen navigacioni log u memoriji. Log se može podeliti dugim pritiskom na verziju u Settings.
- **16 / 15:** osvežavanje ne uklanja postojeći sadržaj turnira, profila i huba; greška i prazna lista imaju različit prikaz i mogućnost ponavljanja.
- **3:** prelazi čekaju zatvaranje modala i završetak animacije stack-a. Odloženo ponovno otvaranje otkazuje se pri gubitku fokusa. iOS koristi `onDismiss` uz rezervno čekanje; Android koristi rezervno čekanje jer RN 0.81 ne pruža taj callback na Androidu.
- **4:** otvaranje meča iz notifikacije čeka odgovarajuće podatke u istom modalu; prethodni meč se ne prikazuje tokom učitavanja novog.

## Faza 2

- **6:** kartica prati promene statusa i termina dobijene od roditeljskog ekrana.
- **7:** trajni lokalni `chatRead` više ne skriva buduće nepročitane poruke. Uspešno čitanje menja cache, a novi badge događaji osvežavaju mečeve.
- **5:** odgovori starijih zahteva ne prepisuju noviji sadržaj turnira, profila i meča; polling timskog meča ne preklapa zahteve.
- **17:** stranica napreduje tek posle uspeha; neuspešna stranica može ponovo da se učita bez preskakanja i gubitka postojećih redova. Nova pretraga članova odvaja se od prethodne paginacije.
- **18:** prijava i registracija imaju mrežni rok od 15 sekundi koji uključuje telo odgovora; lokalna odjava ne čeka server. Zakasneli odgovori proveravaju aktivnu sesiju.
- **11:** kartica meča koristi zajednički `MatchChatPanel` i učitavanje istorije po stranicama.
- **8 / 19:** DM i chat meča rade samo u fokusu, na aktivnom tabu i u prvom planu. Ponovno povezivanje ponavlja ulazak u grupu i dopunjava propuštenu istoriju; stanje veze je vidljivo.
- **20:** nova poruka ne spušta listu dok se čitaju starije poruke; postoji dugme za povratak na nove poruke.
- **21:** poruka u slanju i neuspešna poruka ostaju zasebno prikazane. Ponavljanje šalje sačuvan tekst, bez prepisivanja novog unosa i bez paralelnog duplog slanja iste stavke. Promena taba zadržava red slanja dok je modal montiran.

## Automatske provere

Rezultat nakon dodatnih stavki 7, 6 i 9 iz review-a: **109/109 testova prolazi**. TypeScript provera je bez grešaka, a lokalni Expo export uspeva za Android i iOS. `git diff --check` je čist.

- `npm run test:frontend`: router, tranzicije, istorija chata, deduplikacija poruka, red slanja, odbacivanje starih odgovora, ponovno povezivanje i timeout.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`
- Lokalni Expo export za Android i iOS proverava pakovanje JavaScript-a i resursa. Nije zamena za native build ili probu na uređaju.

## Dodatni review faza 1 i 2

Ispravljeni slučajevi koji nisu bili pokriveni prvih 45 testova:

- Zahtev prethodne sesije ne sme da se ponovi sa tokenom drugog naloga posle zakasnelog 401 odgovora. Odgovori, čitanje njihovog tela i upload provere vezani su za sesiju koja je pokrenula zahtev. Odloženo čitanje iz SecureStore-a ne vraća token posle odjave.
- Upisivanje tokena pri osvežavanju, prijavi i odjavi ide kroz zajednički red. Zakasneli upis ne prepisuje novu prijavu. Prijava koju je zamenio drugi pokušaj čisti sopstveni nepotpuni upis; stariji pokušaj ne gasi indikator novijeg pokušaja.
- Tiho osvežavanje koje zameni običan zahtev završava njegov indikator učitavanja. Neuspešno prvo učitavanje detalja meča ima grešku i dugme za ponavljanje. Osvežavanje već učitanog žreba prikazuje obaveštenje o grešci i čuva sadržaj.
- Odgovor na čitanje chata koji stigne posle nove poruke usklađuje broj nepročitanih poruka sa serverom, umesto da ostavi pogrešnu lokalnu nulu.

Novi testovi izvršavaju stvarne Axios interceptore, funkcije prijave/osvežavanja i React Query cache uz kontrolisane odgovore. Ne proveravaju native raspored, animacije niti tastaturu. ADB provera nije našla povezan Android uređaj ili emulator; proba na uređaju ostaje otvorena.

## Proba na Androidu i iOS-u pre objave

1. Brzo tapnuti dve kartice; zatim odmah sa novog ekrana otvoriti profil. Drugi zakasneli tap ne otvara ekran, a validan sledeći korak radi.
2. Isti DM otvoriti sa profila i iz notifikacije, uključujući notifikaciju dok se prvi zahtev još učitava. Back ne otkriva drugu kopiju razgovora.
3. Meč → profil igrača → Back, timski meč → pojedinačni meč → Back, pa notifikacija za drugi meč. Nema preklapanja native modala niti sadržaja prethodnog meča.
4. Isključiti mrežu posle učitavanja turnira/profila/huba. Osvežavanje čuva sadržaj; ponavljanje radi po povratku mreže. Greška prve i sledeće stranice ne prikazuje lažnu praznu listu i ne preskače stranicu.
5. U chatu učitati starije poruke, primiti novu poruku i proveriti da pozicija ostaje ista. Dugme za nove poruke vodi na kraj.
6. Otvoriti drugi ekran ili poslati aplikaciju u pozadinu. Nove poruke ostaju nepročitane; po povratku se istorija dopuni i stanje veze oporavi.
7. Poslati poruku bez mreže, ukucati novi tekst i ponoviti neuspelu poruku. Tekstovi ostaju odvojeni. Proveriti i promenu taba dok slanje traje.
8. Pročitati chat, zatvoriti ga, primiti novu poruku i proveriti da se badge ponovo pojavi. Proveriti ažuriranje termina/statusa već prikazane kartice.
9. Proveriti prijavu/registraciju na vezi koja ne odgovara i odjavu bez mreže.

Native animacije, tastatura i ponašanje u pozadini još zahtevaju probu na uređaju. Red neuspelih poruka nije trajno skladište i ne preživljava gašenje aplikacije; trajni nacrti nisu deo ove faze.

## Druga runda review-a

- **Hladan start (kritično):** router je odbacivao tapove sa početnog taba dok korisnik ne promeni tab, jer React Navigation upisuje stanje tab navigatora u root tek na prvu navigaciju unutar tabova. Nepoznat izvor sada prolazi samo kad je fokusiran root ekran tab navigator čije stanje još nije upisano. Zatvoren ekran i dalje ne može da navigira, a zakasneli tap sa pokrivenog ekrana i dalje se odbacuje.
- **Osvežavanje žreba:** traka pamti koji je resurs pao (turnir, žreb). "Pokušaj ponovo" ponavlja baš njega, a traka nestaje tek kad svi uspeju.
- **Chat zahtevi:** lokalna nula za nepročitane važi samo za liste koje se nisu menjale tokom čitanja. Provera kod servera ostaje, ali je push i čitanje dele: najviše jedno osvežavanje mečeva u sekundi. Posle čitanja se osvežavaju samo brojači, a čitanje se šalje najviše jednom u sekundi i šalje se i pri napuštanju chata.
- **Sesija pri prekidu mreže:** sesiju briše samo odbijanje refresh-a od servera (400/401/403), refresh bez tokena ili odgovor bez novih tokena. Prekid mreže, timeout i 5xx je čuvaju.
- **Poruke i indikatori:** prijava i registracija bez odgovora prikazuju prevedenu poruku. Traka "Connecting…" se pojavljuje tek posle 1,2 s. Neuspela poruka može da se ukloni. Red u inboxu pokazuje spiner dok se otvara DM.

Expo export za Android i iOS uspeva, a `git diff --check` je čist.


## Treća runda review-a

- Čitanje chata proverava noviji keš po brojaču izmena (`dataUpdateCount`), ne po vremenu: dva upisa u istoj milisekundi više ne mogu da obrišu bedž nove poruke.
- Novi tap u inboxu uvek gasi spiner prethodnog otvaranja, i kad je novi tap notifikacija sa spoljnim linkom.

## Dodatne dorade iz review-a: 7 → 6 → 9

Ovi brojevi se odnose na Claude-ov poslednji review, ne na prvobitni plan. Ova runda se odnosila samo na faze 1 i 2.

- **7 — spajanje DM-ova:** ostaje trenutno vidljiva ruta (ako su obe skrivene, ostaje prvobitna). Nacrti i red slanja žive izvan pojedinačne rute. Tekst vidljivog razgovora ostaje u unosu; drugi, različit tekst prikazuje se kao sačuvan nacrt. Vraćanje nacrta čuva postojeći unos umesto da ga prepiše. Neuspele poruke prenose se zajedno sa porukama koje se još šalju. Zahtev u toku se ne ponavlja; njegov uspeh ili neuspeh stiže u preživeli razgovor. Stanje je samo u memoriji, oslobađa se pri napuštanju razgovora i odjavi.
- **6 — povratak modala:** blur turnira pamti otvoreni pojedinačni ili timski meč i aktivni tab, pa skloni oba modala. Back vraća samo zapamćeni prikaz nakon stack tranzicije. Eksplicitna navigacija do turnira, uključujući novu notifikaciju, poništava prethodni povratak. Sačuvan je tok timski meč → pojedinačni meč → profil → Back → zatvori pojedinačni → timski meč. Unosi rezultata, nepotpuni redovi serije, izbor termina, tekst stream forme i chat nacrt/red slanja čuvaju se izvan native podstabla koje se zatvara.
- **9 — početni prikaz meča:** poznati igrači, zaglavlje i termin/rok vide se odmah. Detalji i akcije prikazuju se tek nakon uspešnog učitavanja. Greška prvog učitavanja ima ponavljanje. Meč otvoren samo ID-em zadržava jedan loader dok ne stignu potrebni podaci. Promena meča resetuje stanje pre prvog prikazanog frejma, uz istu native Modal instancu. Povratak na isti učitani meč osvežava podatke tiho i čuva edit režim. Tabovi imaju stalnu širinu u horizontalnom redu; novootkriveni tabovi dodaju se na kraj, bez pomeranja ranijih tabova.

Dodati testovi proveravaju router sa stvarnim prenosom nacrta, slanje koje se završi nakon spajanja, ponavljanje neuspele poruke bez duplog POST-a, stvarni focus callback turnira, novu navigaciju tokom povratka, početni prikaz i stabilan red tabova. U izdvojenoj kopiji potvrđeno je da testovi padaju kad se uklone odgovarajuće zaštite. Automatski testovi ne potvrđuju native animaciju ili vizuelni raspored.

Dodatna proba na oba uređaja:

1. Otvoriti isti DM iz dva izvora tokom razrešavanja identiteta. Proveriti očuvanje vidljivog unosa, vraćanje drugog nacrta i slanje koje se završi posle spajanja.
2. Otvoriti meč, promeniti tab i uneti tekst/rezultat (uključujući pola reda serije). Otići na profil i vratiti se; ponoviti sa notifikacijom za drugi ekran. Proveriti unose i jedno otvaranje modala posle animacije.
3. Dok traje povratak, otvoriti novu notifikaciju za drugi meč. Stari modal se ne vraća preko novog. Proveriti ceo timski tok i ručno zatvaranje modala.
4. Na sporoj mreži otvoriti meč iz žreba, zatim drugi meč. Imena su tačna od prvog prikaza, prethodne akcije/rezultati se ne pojavljuju, a tabovi ostaju na mestu. Proveriti neuspeh i Retry, otvaranje iz notifikacije i tihi povratak na isti meč.

ADB provera za ovu doradu nije našla povezan uređaj/emulator. Proba na uređaju ostaje otvorena. Ovaj paket nije objavljen.

Stavka 12 iz faze 3 implementirana je u narednom paketu, dokumentovanom u [frontend-phase-3-cache.md](frontend-phase-3-cache.md).
