# Videoton TV Computer (TVC) Képkészítő - Teljes Felhasználói Kézikönyv (v4.3)

## Bevezetés
A Videoton TV Computer (TVC) Képkészítő egy professzionális eszköz, amelyet modern digitális képek klasszikus 8 bites magyar Videoton TV Computer (TVC) natív grafikus formátumába való átalakítására terveztek. Az eszköz pontosan szimulálja a TVC hardveres korlátait, beleértve az egyedi 16 színű palettát (megjegyzés: mivel 2 fekete van, ez gyakorlatilag 15 színt jelent) és az anamorfikus pixeleket.

## 1. Első Lépések
A kezdéshez töltsön be egy képet:
- Kattintson a középső **"Válassz képet vagy húzd ide"** területre.
- Alternatív megoldásként húzzon be egy képfájlt közvetlenül a böngészőablakba.
A betöltés után valós időben láthatja a kép előnézetét a TVC korlátozott felbontásában és színpalettájával.

### 1.1. Keret automatikus levágása (Auto-Crop Border)
- A betöltési felületen kiválasztható a **"Keret automatikus levágása (bal felső pixel alapján)"** opció.
- Ha be van kapcsolva, a kép betöltésekor a rendszer megvizsgálja a bal felső sarokpixel (x=0, y=0) színét, és automatikusan eltávolítja a kép 4 oldaláról a körülötte lévő egyszínű keretet/margót.
- A már betöltött képeknél a Kompozíció panel fejlécében található **"Keret levágása"** gombra kattintva bármikor utólag is 1 kattintással levágható a kép körüli egyszínű keret.

## 2. A Felület Áttekintése

### 2.1. Színmódok
Az alkalmazás három különböző TVC grafikus módot támogat. Ezek között a megfelelő gombokkal válthat. Az alkalmazás minden módhoz megjegyzi a beállításokat, így a visszaváltáskor a korábbi paraméterek visszaállnak.

*   **16 Szín:** Az eredeti 128x240-es felbontású mód. A pixelek vízszintesen nyújtottak (2:1 képarány). Mind a 16 TVC szín (15 egyedi szín) elérhető.
*   **4 Szín:** 256x240-es felbontású mód. A pixelek 1:1 képarányúak (négyzetesek). A palettából egyszerre csak 4 szín jeleníthető meg. Az alkalmazás automatikusan kiválasztja a képhez legjobban illő 4 színt, de a "Kiválasztott színek" panelen manuálisan is felülbírálhatja azokat.
*   **2 Szín:** 512x240-es felbontású mód. A pixelek 1:1 képarányúak (négyzetesek). Egyszerre csak 2 szín jeleníthető meg. Az alkalmazás automatikusan kiválasztja a legjobb 2 színt, amit szintén manuálisan is felülbírálhat. Ebben a módban elérhető egy "Színek felcserélése" gomb is, amellyel a kimeneti képen megcserélheti a két kiválasztott színt (pl. piros alapon fehér képből fehér alapon piros kép lesz), anélkül, hogy a palettát módosítaná.

### 2.2. Képméret Módok
*   **Eredeti méret:** A kép az eredeti felbontásában marad, de az aktuálisan kiválasztott színmód palettáját és dithering beállításait alkalmazza. Ebben a módban két mentési lehetőség közül választhat:
    *   **Eredeti méret:** A teljes forráskép mentése az eredeti felbontásában, de TVC színekkel és ditheringgel.
    *   **Kompozíció:** Csak a képernyőn látható kivágás (zoom és pan beállítások szerint) mentése a választott TVC mód fix felbontásában (pl. 128x240).
*   **Teljes TVC képernyő:** A kép a TVC teljes látható képernyőfelbontására lesz méretezve. A pontos felbontás a grafikus módtól függ (512x240, 256x240 vagy 128x240), de a fizikai képarány mindig nagyjából 4:3. A pixelek képaránya a választott módtól függően változik (16 színű módban vízszintesen nyújtottak, 2 színű módban zsugorítottak, 4 színűben pedig négyzetesek), így a végső kép mindig ugyanazt a 4:3-as fizikai képernyőterületet tölti ki.
*   **TVC256k++:** Speciális 16 színű üzemmód 256x240 pixeles felbontással és 1:1 pixel képaránnyal (négyzetes pixelek).

### 2.3. Kompozíció és Pozicionálás
A TVC képernyő fizikai képaránya 4:3, a pixelek alakja és a felbontás a választott színmódtól függ. A kompozíciós beállítások határozzák meg, hogyan illeszkedjen a forráskép ebbe a TVC képernyőbe.

*   **Megjelenítési Módok:**
    *   **Kitöltés vágással:** Kitölti a teljes területet, levágva a felesleges részeket.
    *   **Teljes kép:** Megjeleníti a teljes képet, a széleket a háttérszínnel kitöltve.
    *   **Nyújtás:** A képet pontosan a TVC felbontására kényszeríti (torzulást okozhat).
*   **Nagyítás:** 10% és 1000% között állítható. Használja a csúszkát vagy az egér görgőjét.
*   **Pozicionálás:** Húzza a képet az egérrel, vagy használja a vízszintes/függőleges pozíció csúszkákat. A "Középre" gombbal visszaállíthatja a képet.

### 2.4. Képbeállítások
Finomhangolja a forrásképet a jobb konverzió érdekében.
*   **Fényerő:** A teljes világosság beállítása.
*   **Kontraszt:** A világos és sötét területek közötti különbség növelése.
*   **Telítettség:** A TVC színei élénkek; előfordulhat, hogy csökkenteni kell a forrás telítettségét.
*   **Gamma:** A középtónusok fényerejének szabályozása.
*   **Automata Módok (A1 / A2 / A3):**
    *   **A1 (TVC Stílus):** Automatikusan megtalálja a legstílusosabb beállításokat és dither eljárásokat az autentikus retro TVC képi világ előnyben részesítésével.
    *   **A2 (Hűség Mód):** Kifejezetten a beállított kompozícióra és kivágásra koncentrálva megtalálja azokat a paramétereket, amelyeknél a konvertált kép matematika szerint és vizuálisan a legkisebb eltérést mutatja az eredeti kép ugyanazon részletéhez képest.
    *   **A3 (Tiszta Pixel Art):** Kézzel pixelezett grafikákhoz illő, sík színfelületekre optimalizált mód. Szándékosan kizárja a hibaterjesztéses (zajos) dither módokat, és nem alkalmazza az A1/A2-ben használt "sötét kép felderítése" heurisztikát sem, mert egy szándékosan sötét/hangulatos kép (pl. éjszakai jelenet) sötét is maradjon. Mértékadó teszteknél ez a mód adta a legjobb egyezést kézzel pixelezett referenciaképekkel.
    *   **A4 (Precizitás):** Az A1-A3 kézzel belőtt súlyozói helyett valódi **strukturális hasonlóságot (SSIM)** számol a konvertált és az eredeti kép között, blokkonként. Mivel nem tartalmaz előfeltevéseket arról, melyik dither "szokott jól kinézni" egy adott képtípusnál, általában kiegyensúlyozottabban általánosít ismeretlen képekre. Lassabb, mint a többi automata mód.
*   **Visszaállít:** Alaphelyzetbe állítja a csúszkákat.
*   **Beállítások másolása (4c / 2c stb. gombok):** A "Képbeállítások" felirat mellett található gombokkal egy kattintással átmásolhatja a többi színmódban (pl. 4 színű vagy 2 színű mód) megadott csúszka-beállításokat a jelenlegi módba.

### 2.5. Dither mód (Színkeverés)
Mivel a TVC csak 15 színt támogat, a program dithering (szórás) segítségével szimulálja a színátmeneteket.
*   **Módszerek:**
    *   **Modernist:** Egyensúly a részletek és a tiszta színek között.
    *   **Ordered (Classic):** Szabályos mintázatú dithering, a 80-as évek stílusában.
    *   **Diffusion (Sierra/Stucki/Jarvis):** Természetes, hibaterjesztésen alapuló módszerek.
    *   **Pattern TVC:** A TVC hardverre optimalizált mintázat. Úgy működik, hogy egy sakktábla mintát hoz létre a paletta két gondosan kiválasztott színének váltakozásával. Ez kihasználja a TVC videokimeneti jellemzőit, vizuálisan összekeverve a két színt a CRT képernyőkön, hogy egy harmadik, köztes szín illúzióját keltse a hibaterjesztés zaja nélkül.
    *   **Threshold (No pattern):** Nincs dithering, csak a legközelebbi szín.
    *   **Ostromoukhov (Adaptív):** Változó együtthatós hibaterjesztés (Victor Ostromoukhov, SIGGRAPH 2001). A Floyd-Steinberg és társai minden fényerő-szinten ugyanazokat a fix súlyokat használják; ez a módszer mind a 256 bemeneti szinthez külön, optimalizált együtthatókészletet alkalmaz. Ezzel csökkennek a hibaterjesztésre jellemző "kukac"-mintázatok, és a zaj spektruma minden tónusnál közelebb kerül a kellemes blue noise-hoz.
    *   **Blue Noise 16x16:** A meglévő 8x8-as blue noise nagyobb testvére. A 8x8-as csempe egy 128x240-es vásznon elég sűrűn ismétlődik, ami halvány, szabályos mintázatként észrevehető; a 256 szintű, 16x16-os csempe jóval ritkábban ismétlődik, így simább, kevésbé strukturált szemcsét ad.
    *   **Blue Noise 16x16 (2:1-re optimalizált):** Kifejezetten a 16 színű mód 2:1-es képarányához készült változat - lásd a lenti megjegyzést.
    *   **Yliluoma:** Joel Yliluoma klasszikus, kifejezetten kicsi/szabálytalan palettákra (mint amilyen a TVC 15 színe) kitalált algoritmusa. A Pattern TVC ötletét általánosítja: nem csak 2, hanem akár 8 palettaszínt is kombinálhat egy adott ponton, gamma-korrekt (lineáris fényben történő) keveréssel, finomabb átmeneteket adva. *Megjegyzés:* mivel a TVC palettájában kevés az egymáshoz közeli árnyalat, ez a mód sík, sötét területeken (pl. éjszakai égbolt) inkább színes "konfetti-zajt" adhat a Pattern TVC-hez képest - főleg fotó jellegű, folytonos átmenetű képeknél éri meg kipróbálni.

*   **Megjegyzés a 2:1-es képarányhoz (16 színű mód):** ebben a módban egy logikai képpont a képernyőn kétszer olyan széles, mint amilyen magas. A hagyományos (négyzetes) dither-csempék ezért vízszintesen 2x megnyúlva jelennek meg a valódi TVC-képernyőn - a szemcse "szélesnek", elkentnek tűnik. A **Blue Noise 16x16 (2:1-re optimalizált)** csempe generálásakor a vízszintes távolság duplán számított, így a minta a tényleges képernyőn lesz szabályos. *Fontos:* egy hagyományos csempe egyszerű vízszintes átmintavételezése nem működik (a mátrix oszlopainak csak a felét olvasná, és csúnya vízszintes csíkokká esne szét) - ezért készült külön csempe.

*   **Sorminta keverés (csak Pattern TVC módoknál):** A "Haladó beállítások" alatt kapcsolható. A Pattern TVC alapból sakktábla-mintában váltogatja a két színt; bekapcsolva ehelyett **váltakozó sorokban** keveri őket. A 16 színű mód 2:1-es képpontjain ez valódi CRT-n gyakran simábban olvad össze, és a korabeli kézi pixelezésben is bevett technika volt.

*   **Pár-letiltás (csak Pattern TVC / Yliluoma módoknál):** A "Dither Finomhangolás" alatt megjelenő rácsban egyenként letiltható, mely két szín keveredhet egymással a mintázatos dithering során. A rács főátlós celláira kattintva egy adott szín *teljesen* kizárható (minden párjával együtt), ismételt kattintásra pedig visszakapcsolható. Egy teljesen kizárt szín valamelyik vegyes cellájára kattintva **az a konkrét kombináció külön visszaengedhető**, miközben a szín tömör színként kizárva marad - így finoman szabályozható, hogy egy szín csak bizonyos keverékekben jelenjen meg.

    *Yliluoma módban* ugyanitt egy egyszerűsített panel jelenik meg: mivel a Yliluoma nem párokban, hanem akár 8 szín keverékében gondolkodik, ott csak a színek teljes ki-/bekapcsolása értelmezhető, ezért egyetlen sorban találja a 15 színt.

*   **Dither Finomhangolás:**
    *   **Dithering mértéke:** Mennyire legyen "szemcsés" a kép.
    *   **Zajszint:** Véletlenszerű mintákat ad hozzá a sávosodás elkerülése érdekében.
    *   **Tiszta felületek védelme:** Megakadályozza a ditheringet az egyszínű területeken.

### 2.6. Háttérszín
Válasszon egyet a 15 fix TVC szín közül az üres területek kitöltéséhez.

### 2.7. Exportálási Lehetőségek
1. **Mentés BMP-ként:** Szabványos Windows BMP fájl a TVC palettájával.
   *   *Megjegyzés a 16 Szín módhoz:* A BMP-t mentheti **1:1** pixelaránnyal (128x240, nyers tárolási formátum) vagy **2:1** pixelaránnyal (256x240, nyújtva a TVC tényleges megjelenítésének szimulálására).
   *   *TVC256k++ mód:* A BMP mentése 16 színű indexelt (4 bpp) formátumban történik (256x240, pontosan 30 838 bájt fájlmérettel).
2. **Mentés TVC bin-ként:** Nyers bináris adat valódi TVC-hez vagy emulátorhoz.
   *   *TVC256k++ mód:* 256x240 felbontású 16 színű kép, bájtonként 2 ponttal (1. pont a felső 4 bit, 2. pont az alsó 4 bit IRGB kódja, összesen 30 720 bájt).
3. **Mentés ZX7 bin-ként:** ZX7 algoritmussal tömörített bináris adat (`.bin.zx7` kiterjesztéssel), amely kevesebb helyet foglal és gyorsabban betölthető a TVC-n.

*A fájlnevek automatikusan tartalmazzák a színmód/felbontásmód utótagját (pl. `_16c`, `_4c`, `_2c`, `_256k`). 16 színű módban a BMP fájlnév tartalmazza a képarányt is (pl. `_1_1` vagy `_2_1`). Minden gombhoz tartozik egy rövid leírás (tooltip), amely megjelenik, ha fölé viszi az egeret.*

### 2.8. Haladó Képfeldolgozás
A v3.8 és v3.9-es verzióban bevezetett eszközök segítenek a forráskép előkészítésében a lehető legjobb konverzió érdekében.

*   **Elő-zajszűrés:** Csökkenti a forráskép digitális zaját a feldolgozás előtt. Ez különösen hasznos fotóknál, mivel megakadályozza, hogy a dithering algoritmus a "zajt" pontozza ki, így tisztább, összefüggőbb felületeket eredményez a TVC-n.
*   **Élkiemelés:** Egy finom élesítő eszköz, amely kiemeli a fontos éleket (például egy arc körvonalait). Ez segít abban, hogy a részletek "túléljék" a kicsinyítési folyamatot, és a végső kép ne legyen túl elmosódott.
*   **Dinamikatartomány-tömörítés (Tone Mapping):** Tömöríti a nagy kontrasztú képek dinamikatartományát. Ha a fotón egyszerre vannak nagyon sötét és nagyon világos részek, a tone mapping segít mindkettőben láthatóvá tenni a részleteket a TVC korlátozott palettáján belül.
*   **Serpentin szkennelés:** Soronként megváltoztatja a dithering folyamat irányát. Ez megtöri a függőleges "csíkozódást", és természetesebb megjelenésű dithering mintákat hoz létre.
*   **Percepciós színtávolság:** Ha be van kapcsolva, a program az emberi szem tényleges színérzékelése alapján számítja ki a színek hasonlóságát (nagyobb súlyt adva a zöldnek és kevesebbet a kéknek). Ez sokkal természetesebbnek tűnő színhelyettesítéseket eredményez.
*   **Pötty-szűrés:** Automatikusan eltávolítja az izolált "kóbor" pixeleket, amelyek néha megjelenhetnek a dithering során. Ez sokkal tisztább, "kézzel rajzolt" hatást eredményez, különösen grafikák és illusztrációk esetén.
*   **Sima kicsinyítés:** Alapértelmezésben a program a forrásképet "legközelebbi szomszéd" módszerrel kicsinyíti: minden célképpontba egyetlen forrásképpont kerül. Ez gyors, és a keletkező finom zaj sokszor kellemes, "kézzel rajzolt" textúrát ad ditherelés után - fotóknál viszont csipkézést (aliasingot) okozhat. Bekapcsolva a program ehelyett **gamma-korrekt területátlagolást** végez: minden célképpont a teljes hozzá tartozó forrásterület átlaga, lineáris fényben számolva (ugyanaz az elv, mint a Yliluoma színkeverésénél). Az eredmény tisztább, kevésbé csipkézett, fotószerű forrásoknál általában jobb. Kifejezetten pixel-art jellegű forrásnál érdemes kikapcsolva hagyni.
*   **Precíz Auto Szín (Lab):** Csak 4 és 2 színű módban, és csak bekapcsolt "Auto Szín" mellett. Az automatikus színválasztás alapból a gyors *redmean* közelítéssel méri a színtávolságot; bekapcsolva ehelyett a percepciósan egyenletes **CIELAB** színteret használja, ami különösen a kék-lila tartományban pontosabb. Mivel ez a lépés konverziónként csak egyszer fut le (nem képpontonként), a többletszámítás gyakorlatilag nem érződik.
*   **Automata színválasztás (K-Means):** 4 és 2 színű módoknál egy kifinomult matematikai algoritmust (K-Means clustering) használ, hogy megtalálja a matematikailag optimális színkészletet az adott képhez, ahelyett, hogy csak a leggyakoribbakat választaná ki.
*   **Átlátszó háttér maszkolása (TVC256k++ / Sprites):** A Kompozíció panelen található gombbal automatikusan feltérképezhető a hasznos rajzot körülvevő külső egyszínű háttér. A program a külső képpontokat a **9. fekete (`1000` / `0x8` átlátszó)** kódra állítja át, miközben a figura belsejében lévő normál fekete részeket megvédi. A képernyőn a maszk egy egyedi neon-magenta mintával jelenik meg, amely tetszés szerint ki/be kapcsolható, mentéskor pedig a BMP és BIN fájlokba az átlátszó kód kerül.

### 2.9. Beállítások Mentése és Betöltése
A bal oldali panelen mentheti el aktuális beállításait 3 slotba. A mentett beállításokat bármikor betöltheti a megfelelő számú gombbal. A mentett slotokat a gomb sarkában megjelenő kis 'x' gombbal törölheti.

A 3 gyorsslot mellett mindkét oldalon található egy **4. gomb** is:
*   **Mentés fájlba (letöltés ikon):** Nevet kér, majd letölt egy `.tvcset` kiterjesztésű fájlt. A tartalma tördelt, jól olvasható JSON, ezért bármely szövegszerkesztőben megnyitható és akár kézzel is szerkeszthető.
*   **Betöltés fájlból (feltöltés ikon):** Egy korábban mentett `.tvcset` fájl visszatöltése.

A gyorsslotokkal szemben ez tetszőleges nevet enged, és **fizikailag letöltődik** a gépére - így átmásolható, elküldhető, biztonsági mentésként megőrizhető, és más gépen vagy böngészőben is visszatölthető.

## 3. Pixel Szerkesztő
A konvertált kép pixelenkénti kézi finomítására szolgáló önálló szerkesztő. **Mind a négy videomódot támogatja:** 16 színű (128x240, 2:1 képarány), TVC256k++ (256x240, négyzetes), 4 színű (256x240) és 2 színű (512x240).

**Megnyitás:**
*   Egy kész konvertálás eredménye mellett, az előnézet alatti sorban található **"Pixel Szerkesztő"** gombbal nyithatja meg az aktuális képet szerkesztésre (16, 4 és 2 színű módban).
*   A kezdőképernyőn (még kép betöltése előtt) négy linkkel közvetlenül is nyithat egy üres (fekete) vásznat bármelyik módban.
*   A szerkesztőn belüli **"Megnyitás"** gombbal a program saját korábbi exportjai tölthetők vissza **konvertálás nélkül**: `.bmp`, `.bin` és ZX7-tömörített `.bin.zx7` fájlok egyaránt. A felbontás és a mód automatikusan felismerésre kerül (BMP-nél a fejlécből, BIN-nél a fájlméretből).
    *   *Megjegyzés:* a 16, 4 és 2 színű BIN fájlok mérete egyaránt pontosan 15 360 bájt, tehát méret alapján nem megkülönböztethetők. Ezért a program a **szerkesztő aktuális módját** részesíti előnyben, ha az illik a mérethez - a saját munkája visszatöltésekor így nem kérdez feleslegesen. Ha a méret egyikkel sem egyezik pontosan, egy választóablak jelenik meg a legvalószínűbb tippel előre kiválasztva.
*   A **"Vissza a konverterhez"** gombbal léphet vissza - a szerkesztőben végzett módosítások nem kerülnek vissza a konverterbe, azok csak a szerkesztőből exportálhatók. Ha mentetlen módosítása van, a program megerősítést kér.
*   A szerkesztő saját **nyelvválasztóval** rendelkezik a jobb felső sarokban; ez ugyanazt a beállítást használja, mint a konverter, tehát a két felület nyelve mindig együtt mozog.

**Nézet és navigáció:**
*   **Nagyítás:** az egérgörgővel, a kurzor pozíciója körül központosítva. Az induló nagyítás a mód natív méretéhez igazodik: a 2 színű mód (512 képpont széles) 1:1-ben nyílik, a keskenyebb módok előnagyítva.
*   **Mozgatás (pan):** a középső egérgomb lenyomva tartásával és húzással, vagy a natív görgetősávokkal.
*   Egy bizonyos nagyítási szint felett a program vékony pixelrácsot jelenít meg; a rács az eszköztár ikonjával ki/be kapcsolható.
*   **Átlátszóság-kijelzés kapcsoló** (csak 16 színű módokban, szem ikon): az átlátszó képpontok alapból feltűnő magenta-fekete sakktáblaként jelennek meg. Mivel ez a minta összetéveszthető egy ditherelt felülettel, a kapcsolóval egyszerű feketére váltható - így látható, hogyan fog a kép ténylegesen kinézni.
*   Az oldalpanelen egy kis élő előnézet mutatja a teljes képet a végső, helyes képarányban.

**Rajzeszközök:**
*   **Ceruza, Vonal, Téglalap (körvonal), Kitöltött téglalap, Ellipszis, Kitöltés (vödör), Kijelölés.**
*   A **vastagság** csúszkával állítható a ceruza és a vonalas eszközök vastagsága.
*   **Visszavonás / Újra:** 20 lépés mélységig, a `Ctrl+Z` és `Ctrl+Y` (vagy `Ctrl+Shift+Z`) billentyűkkel, illetve az eszköztár gombjaival.

**Pepita kitöltés:**
Az eszköztár kapcsolójával bekapcsolva **minden** rajzeszköz az elsődleges és másodlagos szín sakktábla-mintájával rajzol - nem csak a kitöltött alakzatok, hanem a ceruza, a vonal, a körvonalak és a festékesvödör is, az élő előnézettel együtt. Bal és jobb egérgombbal a minta két fázisa közül választhat (azaz melyik szín kerüljön a páros mezőkre), így két egymáshoz illeszkedő mintázat is könnyen kirajzolható.

**Kijelölés, kivágás és áthelyezés:**
A kijelölő eszközzel egy téglalap alakú képrészlet emelhető ki és helyezhető át, lebegő rétegként:
1.  Húzzon egy téglalapot - a kijelölt rész **felemelődik** a képről (a helyén a paletta első színe, azaz fekete marad), és szaggatott kerettel a kép fölött lebeg.
2.  A lebegő részlet **bármikor újra megfogható és arrébb húzható**, akárhányszor. Finomhangoláshoz a **nyílbillentyűk** is mozgatják, képpontonként.
3.  Elhelyezés: **Enter**, a zöld pipa gomb, vagy kattintás a kijelölésen kívülre.
4.  Megszakítás: **Esc** vagy az X gomb - ilyenkor a részlet visszakerül az eredeti helyére.

A teljes kivágás-áthelyezés műveletet a program **egyetlen visszavonható lépésként** kezeli, tehát egy `Ctrl+Z` állítja vissza az egészet. Ha lebegő kijelöléssel eszközt vált, a program lerakja a kijelölést, nem dobja el némán.

**Kép-transzformációk:**
*   **Vízszintes és függőleges tükrözés.**
*   **Görgetés** fel / le / balra / jobbra, kattintásonként egy képponttal. A görgetés **körbeér**: ami az egyik szélén kicsúszik, a másikon visszajön, így semmi nem vész el.
*   Mindegyik művelet visszavonható.

**Színek:**
*   **Bal egérgomb** az elsődleges, **jobb egérgomb** a másodlagos színnel rajzol. Egy palettamezőre bal kattintással az elsődleges, jobb kattintással a másodlagos szín állítható be.
*   *16 színű módokban* a paletta 15 valódi TVC színt tartalmaz, plusz egy 16. **"átlátszó"** mezőt (ez a hardver 9. feketéje, amit a TVC a maszkolt képpontokhoz használ). Mentéskor a program automatikusan a helyes átlátszósági kódra és maszkra vált.
*   *4 és 2 színű módokban* csak az adott módban aktív 4, illetve 2 szín jelenik meg (itt nincs átlátszó mező, mert a hardveres bitcsomagolásban nincs rá hely). Minden színmező sarkában egy kis **ceruza ikon** található: erre kattintva a teljes 15 színű TVC palettából választható új szín annak a helynek. A cserével a **már megrajzolt képpontok is átszíneződnek**, hogy a kép ne essen szét, és a lépés visszavonható.
*   Ha a konverterben be volt kapcsolva a **maszk** (TVC256k++ módban), a maszkolt képpontok a szerkesztőben automatikusan átlátszóként jelennek meg.

**Visszaállítás:** az eszköztár visszaállít gombja a kép megnyitáskori állapotát hozza vissza. Mivel ez minden módosítást elvet, a program mindig megerősítést kér (és a lépés maga is visszavonható).

**Mentés:** ugyanazok a formátumok érhetők el, mint a konverterben: **BMP (1:1)**, 16 színű módban emellett **BMP (2:1)** is, **BIN**, és **BIN (ZX7 tömörített)**. A fájlnevek automatikusan `_edit` jelölést és a mód utótagját kapják (`_16c`, `_4c`, `_2c`, `_256k`).

## 4. Tippek
*   A TVC pixelei szélesek; az álló képek gyakran jobban mutatnak elforgatva.
*   Használja az "Automata" gombot, ha nem tudja, hol kezdje.
*   Használja a "Valós méretű előnézet" (szem ikon) funkciót a végső TVC megjelenés megtekintéséhez.
*   Kísérletezzen a "Tiszta felületek védelme" beállítással dithering használatakor, hogy a sima hátterek tiszták maradjanak, miközben az átmenetek finomodnak.
*   Nagy kontrasztú képeknél a "Threshold (No pattern)" módszer gyakran a legélesebb, legfeltűnőbb eredményt adja.
*   Ha a kép sok apró szöveget tartalmaz, próbálja ki a 2 vagy 4 színű módot, mivel a nagyobb vízszintes felbontás sokkal olvashatóbbá teszi a szöveget.
*   Amikor valódi CRT TV-re készít képeket, ne feledje, hogy a színek kissé összefolynak; a "Pattern TVC" dithering módszert kifejezetten ennek a keveredésnek a kihasználására tervezték.
*   **Haladó tipp:** Fotók esetén a legjobb eredmény érdekében próbálja meg egyszerre bekapcsolni a **Percepciós színtávolságot** és a **Serpentin szkennelést**. Ha a kép kicsit "koszosnak" tűnik, egy kevés **Élkiemelés** (20-30% körül) óriási különbséget jelenthet.
