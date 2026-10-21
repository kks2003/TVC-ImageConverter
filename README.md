# Videoton TV Computer (TVC) Image Converter & Pixel Editor (v4.3)

A Videoton TV Computer (TVC) Képkészítő és Pixel Szerkesztő egy professzionális, böngészőben futó céleszköz, amelyet modern digitális képek klasszikus 8 bites magyar Videoton TV Computer (TVC) natív grafikus formátumába való átalakítására és képpontonkénti szerkesztésére terveztek.

---

## Főbb képességek (Key Features)

- **Grafikus módok pontos szimulációja:**
  - **16 Szín (128×240):** 2:1 nyújtott képpontok, a TVC teljes 16 színű (15 egyedi szín) palettájával.
  - **4 Szín (256×240):** 1:1 négyzetes képpontok, 4 aktív színnel (automatikus K-Means színválasztás vagy kézi felülbírálás).
  - **2 Szín (512×240):** 1:1 négyzetes képpontok, nagy felbontású 2 színű grafika színcsere funkcióval.
  - **TVC256k++ (256×240):** Speciális 16 színű üzemmód négyzetes képpontokkal és átlátszósági maszk támogatással.

- **Dithering és képfeldolgozás:**
  - TVC Pattern (sakktábla és váltakozó soros sorminta-keverés), Floyd-Steinberg, Atkinson, Jarvis, Burkes, Sierra, Sierra-Lite, Stucki, Bayer, stb.
  - Gamma-helyes területátlagolás és képátméretezés.
  - Automatikus finomhangoló (Auto-Tune) **A1**, **A2** és **A3 (Tiszta Pixel Art)** heurisztikákkal.
  - Automatikus képszéle-levágás (Auto-crop border).
  - Átlátszósági maszk (9. fekete / `#020202` / `0x8` kódolás).

- **Beépített Pixel Szerkesztő (Pixel Editor):**
  - Ceruza, egyenes vonal, téglalap (üres/kitöltött), ellipszis, vödör (flood-fill).
  - Kijelölés, mozgatás, forgatás, tükrözés, sakktábla-kitöltés, paletta-átszínezés.
  - Többszintű visszavonás / újra (Undo/Redo), nagyítás (zoom), pixelrács.
  - Korábbi exportok visszatöltése konvertálás nélkül: `.bmp`, `.bin` és ZX7-tömörített `.bin.zx7` fájlok.

- **Export formátumok:**
  - **BMP:** TVC-kompatibilis 16 színű 4bpp indexelt BMP (pontosan 30 838 bájt) vagy 24bpp BMP (1:1 és 2:1 arányban).
  - **BIN:** Nyers TVC képernyőmemória bináris fájl (15 360 vagy 30 720 bájt).
  - **ZX7:** Beépített ZX7 algoritmus által tömörített bináris formátum (`.bin.zx7`), azonnal futtatható TVC-n.
  - **TVCSET:** Beállítások mentése és betöltése JSON formátumban.

- **Offline és többnyelvű:**
  - Egyetlen önálló HTML fájlban fut (`image2tvc_offline_v4_3.html`), nem igényel szervert vagy internetkapcsolatot.
  - Magyar és angol nyelvű kezelőfelület és részletes beépített kézikönyv (`USER_MANUAL_HU.md`, `USER_MANUAL_EN.md`).

---

## Használat (Quick Start)

### 1. Közvetlen használat (Offline)
Nem szükséges semmit telepíteni! Egyszerűen nyissa meg az **`image2tvc_offline_v4_3.html`** fájlt bármely modern webböngészőben (Chrome, Edge, Firefox).

### 2. Fejlesztői környezet (Development)
Ha módosítani szeretné a forráskódot vagy új buildet készíteni:

1. **Előfeltétel:** Node.js (v18+)
2. **Függőségek telepítése:**
   ```bash
   npm install
   ```
3. **Fejlesztői szerver indítása:**
   ```bash
   npm run dev
   ```
4. **Önálló offline HTML fordítása:**
   ```bash
   npm run build:offline
   ```
   vagy Windows alatt indítsa el a **`build_offline.bat`** szkriptet.

---

## Licenc és Köszönetnyilvánítás
- TVC hardveres paletta és formátum referenciák: [tvc.homeserver.hu](http://tvc.homeserver.hu)
- Videoton TV Computer Facebook közösség: [facebook.com/groups/videotontvcomputer](https://www.facebook.com/groups/videotontvcomputer)
