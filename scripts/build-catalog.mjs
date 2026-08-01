// scripts/apply-prices.mjs
//
// Куди покласти: у папку scripts/ поряд з build-catalog.mjs
// (тобто casino_final_project/scripts/apply-prices.mjs)
//
// Що робить: бере нові floor-ціни з NEW_PRICES (нижче) і оновлює три файли:
//   1. scripts/build-catalog.mjs   — масив GIFTS (джерело правди для наступних білдів)
//   2. scripts/catalog-resolved.json — вже збережені картинки + ціни
//   3. lib/casino-data.ts          — фінальний каталог, який реально імпортує сайт
//
// Картинки НЕ перезавантажує (мережа для цього не потрібна) — просто підміняє price.
//
// Запуск з кореня проєкту:
//   node scripts/apply-prices.mjs

import fs from "node:fs"
import path from "node:path"

// ---- Нові ціни (id -> floor у TON), зняті зі скрінів MRKT ----
const NEW_PRICES = {
  artisanbrick: 51.88,
  astralshard: 119.79,
  bdaycandle: 4.39,
  berrybox: 6.9,
  bigyear: 3.03,
  blingbinky: 22.41,
  bondedring: 35.64,
  bowtie: 4.16,
  bunnymuffin: 6.6,
  candycane: 3.06,
  chillflame: 3,
  cloverpin: 4.28,
  coffin: 18.75,
  cookieheart: 4.27,
  crystalball: 10.95,
  cupidcharm: 20,
  deskcalendar: 4.17,
  diamondring: 26.52,
  durovsboots: 79.8,
  durovscoat: 83.9,
  easteregg: 3.14,
  electricskull: 21.69,
  eternalcandle: 4.52,
  eternalrose: 23.02,
  evileye: 6.23,
  faithamulet: 4.41,
  flyingbroom: 10.1,
  freshsocks: 3.53,
  gemsignet: 53.65,
  genielamp: 30.28,
  gingercookie: 3.42,
  gravestone: 51.4,
  hangingstar: 7.38,
  happybrownie: 3.53,
  heroichelmet: 173.39,
  hexpot: 3.49,
  holidaydrink: 3.01,
  homemadecake: 4.29,
  hypnolollipop: 3.37,
  icecream: 3.04,
  inputkey: 4.98,
  instantramen: 3.06,
  ionicdryer: 13.43,
  iongem: 60.17,
  jackinthebox: 3.79,
  jellybunny: 6.31,
  jesterhat: 3.25,
  jinglebells: 6.19,
  jollychimp: 6.21,
  joyfulbundle: 6.39,
  khabibspapakha: 22.73,
  kissedfrog: 38.39,
  lightsword: 5.39,
  lolpop: 3.03,
  lootbag: 104.83,
  lovecandle: 7.34,
  lovepotion: 12.74,
  lowrider: 44.58,
  lunarsnake: 2.95,
  lushbouquet: 4.83,
  madpumpkin: 9.69,
  magicpotion: 48.8,
  mightyarm: 104.04,
  minioscar: 70.25,
  moneypot: 4.07,
  moonpendant: 5.26,
  moodpack: 3.57,
  moussecake: 4.18,
  nailbracelet: 103.73,
  nekohelmet: 33.15,
  perfumebottle: 58.91,
  petsnake: 3.06,
  poolfloat: 3.12,
  preciouspeach: 253.65,
  prettyposy: 4.58,
  partysparkler: 3.57,
  rarebird: 21.2,
  recordplayer: 10.6,
  restlessjar: 4.35,
  sakuraflower: 8.02,
  santahat: 3.43,
  scaredcat: 170.34,
  sharptongue: 38.02,
  signetring: 28.96,
  skullflower: 8.81,
  skystiletto: 16.83, // Sky Stiletto(s)
  sleighbell: 5.77,
  snakebox: 2.99,
  snoopcigar: 12.5,
  snoopdog: 4.64, // Snoop Dog(g)
  snowglobe: 3.82,
  snowmittens: 3.86,
  spicedwine: 4.37,
  springbasket: 4.8,
  spyagaric: 4.27,
  starnotepad: 3.84,
  stellarrocket: 4.26,
  swagbag: 4.8,
  swisswatch: 42.64,
  tamagadget: 3.32,
  timelessbook: 3.62,
  tophat: 8.95,
  toybear: 32.93,
  trappedheart: 12.55,
  trojanhorse: 47.12,
  ufcstrike: 13.96,
  valentinebox: 9.1,
  victorymedal: 3.96,
  vintagecigar: 34.07,
  vicecream: 2.96,
  voodoodoll: 31.9,
  westsidesign: 80.68,
  whipcupcake: 3.06,
  winterwreath: 3.06,
  witchhat: 4.38,
  xmasstocking: 2.95,
}

// ---- 1) scripts/build-catalog.mjs: підмінити ціни прямо в масиві GIFTS ----
const buildCatalogPath = path.resolve("scripts/build-catalog.mjs")
let bc = fs.readFileSync(buildCatalogPath, "utf8")
let bcCount = 0
bc = bc.replace(
  /\["([a-z0-9]+)",\s*"([^"]+)",\s*([\d.]+)\]/g,
  (full, id, name, oldPrice) => {
    if (NEW_PRICES[id] !== undefined) {
      bcCount++
      return `["${id}", "${name}", ${NEW_PRICES[id]}]`
    }
    return full
  },
)
fs.writeFileSync(buildCatalogPath, bc)
console.log(`build-catalog.mjs: оновлено ${bcCount} цін`)

// ---- 2) scripts/catalog-resolved.json ----
const resolvedPath = path.resolve("scripts/catalog-resolved.json")
if (fs.existsSync(resolvedPath)) {
  const resolved = JSON.parse(fs.readFileSync(resolvedPath, "utf8"))
  let rCount = 0
  for (const item of resolved) {
    if (NEW_PRICES[item.id] !== undefined) {
      item.price = NEW_PRICES[item.id]
      rCount++
    }
  }
  fs.writeFileSync(resolvedPath, JSON.stringify(resolved, null, 2))
  console.log(`catalog-resolved.json: оновлено ${rCount} цін`)
}

// ---- 3) lib/casino-data.ts: підмінити price всередині CATALOG (і оновити rarity) ----
const dataPath = path.resolve("lib/casino-data.ts")
let ts = fs.readFileSync(dataPath, "utf8")

function rarityFor(price) {
  if (price < 5) return "Common"
  if (price < 15) return "Rare"
  if (price < 50) return "Epic"
  return "Legendary"
}

let tsCount = 0
ts = ts.replace(
  /\{ id: "([a-z0-9]+)", name: "([^"]*)", rarity: "(\w+)", price: ([\d.]+), img: "([^"]*)" \},/g,
  (full, id, name, rarity, oldPrice, img) => {
    if (NEW_PRICES[id] !== undefined) {
      tsCount++
      const newPrice = NEW_PRICES[id]
      const newRarity = rarityFor(newPrice)
      return `{ id: "${id}", name: "${name}", rarity: "${newRarity}", price: ${newPrice}, img: "${img}" },`
    }
    return full
  },
)
fs.writeFileSync(dataPath, ts)
console.log(`lib/casino-data.ts: оновлено ${tsCount} цін`)

console.log("\nГотово. Кейси (CASES) у lib/casino-data.ts групуються по ціновим діапазонам —")
console.log("якщо після оновлення прайсу предмет 'переїхав' у інший rarity/діапазон,")
console.log("щоб і вміст кейсів перерахувався, простіше повністю перегенерувати файл через:")
console.log("  node scripts/build-catalog.mjs")
console.log("(це заново сходить у мережу за картинками — довше, але дає 100% консистентність).")
