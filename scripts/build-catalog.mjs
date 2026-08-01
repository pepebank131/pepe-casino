// One-shot: probe Fragment for real gift image URLs and write the catalog block.
import fs from "node:fs"

// Canonical, de-duplicated gift list: [id, displayName, price]
const GIFTS = [
  ["chillflame", "Chill Flame", 2.28],
  ["vicecream", "Vice Cream", 2.28],
  ["candycane", "Candy Cane", 2.28],
  ["lunarsnake", "Lunar Snake", 2.28],
  ["whipcupcake", "Whip Cupcake", 2.29],
  ["snakebox", "Snake Box", 2.3],
  ["xmasstocking", "Xmas Stocking", 2.3],
  ["instantramen", "Instant Ramen", 2.3],
  ["bigyear", "Big Year", 2.31],
  ["holidaydrink", "Holiday Drink", 2.33],
  ["winterwreath", "Winter Wreath", 2.36],
  ["icecream", "Ice Cream", 2.36],
  ["lolpop", "Lol Pop", 2.4],
  ["petsnake", "Pet Snake", 2.49],
  ["poolfloat", "Pool Float", 2.57],
  ["easteregg", "Easter Egg", 2.6],
  ["hypnolollipop", "Hypno Lollipop", 2.61],
  ["jesterhat", "Jester Hat", 2.64],
  ["santahat", "Santa Hat", 2.65],
  ["tamagadget", "Tama Gadget", 2.67],
  ["gingercookie", "Ginger Cookie", 2.68],
  ["jackinthebox", "Jack In The Box", 2.8],
  ["partysparkler", "Party Sparkler", 2.82],
  ["hexpot", "Hex Pot", 2.87],
  ["happybrownie", "Happy Brownie", 2.92],
  ["freshsocks", "Fresh Socks", 2.95],
  ["moodpack", "Mood Pack", 3.02],
  ["stellarrocket", "Stellar Rocket", 3.1],
  ["moneypot", "Money Pot", 3.08],
  ["prettyposy", "Pretty Posy", 3.09],
  ["snowmittens", "Snow Mittens", 3.1],
  ["starnotepad", "Star Notepad", 3.14],
  ["cookieheart", "Cookie Heart", 3.17],
  ["spicedwine", "Spiced Wine", 3.23],
  ["snowglobe", "Snow Globe", 3.32],
  ["moussecake", "Mousse Cake", 3.39],
  ["timelessbook", "Timeless Book", 3.4],
  ["swagbag", "Swag Bag", 3.45],
  ["witchhat", "Witch Hat", 3.52],
  ["homemadecake", "Homemade Cake", 3.55],
  ["cloverpin", "Clover Pin", 3.57],
  ["springbasket", "Spring Basket", 3.57],
  ["victorymedal", "Victory Medal", 3.58],
  ["bdaycandle", "B-Day Candle", 3.6],
  ["restlessjar", "Restless Jar", 3.62],
  ["faithamulet", "Faith Amulet", 3.73],
  ["inputkey", "Input Key", 3.79],
  ["spyagaric", "Spy Agaric", 3.89],
  ["bowtie", "Bow Tie", 3.93],
  ["deskcalendar", "Desk Calendar", 4.02],
  ["snoopdog", "Snoop Dog", 4.09],
  ["moonpendant", "Moon Pendant", 4.19],
  ["lushbouquet", "Lush Bouquet", 4.44],
  ["eternalcandle", "Eternal Candle", 4.57],
  ["lightsword", "Light Sword", 4.69],
  ["sleighbell", "Sleigh Bell", 5.22],
  ["jinglebells", "Jingle Bells", 5.25],
  ["jellybunny", "Jelly Bunny", 5.51],
  ["evileye", "Evil Eye", 5.63],
  ["mask", "Mask", 5.83],
  ["joyfulbundle", "Joyful Bundle", 6.03],
  ["jollychimp", "Jolly Chimp", 6.06],
  ["berrybox", "Berry Box", 6.09],
  ["hangingstar", "Hanging Star", 6.27],
  ["bunnymuffin", "Bunny Muffin", 6.41],
  ["tophat", "Top Hat", 6.85],
  ["valentinebox", "Valentine Box", 6.89],
  ["lovecandle", "Love Candle", 6.98],
  ["sakuraflower", "Sakura Flower", 7.19],
  ["skullflower", "Skull Flower", 7.5],
  ["recordplayer", "Record Player", 7.85],
  ["crystalball", "Crystal Ball", 7.89],
  ["snoopcigar", "Snoop Cigar", 8.34],
  ["flyingbroom", "Flying Broom", 8.42],
  ["madpumpkin", "Mad Pumpkin", 8.79],
  ["trappedheart", "Trapped Heart", 9.02],
  ["ionicdryer", "Ionic Dryer", 10.92],
  ["ufcstrike", "UFC Strike", 11.22],
  ["lovepotion", "Love Potion", 11.35],
  ["skystiletto", "Sky Stiletto", 12.43],
  ["cupidcharm", "Cupid Charm", 15.86],
  ["khabibspapakha", "Khabib's Papakha", 18.32],
  ["coffin", "Coffin", 18.66],
  ["eternalrose", "Eternal Rose", 18.67],
  ["rarebird", "Rare Bird", 18.84],
  ["blingbinky", "Bling Binky", 18.9],
  ["diamondring", "Diamond Ring", 20.76],
  ["electricskull", "Electric Skull", 21.84],
  ["voodoodoll", "Voodoo Doll", 25.15],
  ["signetring", "Signet Ring", 25.6],
  ["vintagecigar", "Vintage Cigar", 26.14],
  ["toybear", "Toy Bear", 30.28],
  ["nekohelmet", "Neko Helmet", 31.07],
  ["bondedring", "Bonded Ring", 32.34],
  ["genielamp", "Genie Lamp", 32.53],
  ["sharptongue", "Sharp Tongue", 34.44],
  ["kissedfrog", "Kissed Frog", 37.06],
  ["swisswatch", "Swiss Watch", 40.21],
  ["lowrider", "Low Rider", 41.42],
  ["gravestone", "Gravestone", 46.23],
  ["magicpotion", "Magic Potion", 49.12],
  ["gemsignet", "Gem Signet", 51.23],
  ["trojanhorse", "Trojan Horse", 54.76],
  ["artisanbrick", "Artisan Brick", 57.59],
  ["westsidesign", "Westside Sign", 58.79],
  ["perfumebottle", "Perfume Bottle", 59.22],
  ["iongem", "Ion Gem", 59.63],
  ["minioscar", "Mini Oscar", 59.84],
  ["durovsboots", "Durov's Boots", 68.03],
  ["durovscoat", "Durov's Coat", 77.06],
  ["nailbracelet", "Nail Bracelet", 91.19],
  ["lootbag", "Loot Bag", 92.39],
  ["mightyarm", "Mighty Arm", 114.44],
  ["astralshard", "Astral Shard", 118.09],
  ["scaredcat", "Scared Cat", 143.61],
  ["heroichelmet", "Heroic Helmet", 166.41],
  ["preciouspeach", "Precious Peach", 271.2],
  ["plushpepe", "Plush Pepe", 5880.0],
]

// Known exact Fragment collection slugs that differ from naive PascalCase.
const SLUG_OVERRIDES = {
  ufcstrike: "UFCStrike",
  khabibspapakha: "KhabibsPapakha",
  bdaycandle: "BDayCandle",
  westsidesign: "WestSideSign",
  minioscar: "MiniOscar",
  vicecream: "VCream",
  tamagadget: "TamaGadget",
  ionicdryer: "IonicDryer",
  snoopdog: "SnoopDogg",
  skystiletto: "SkyStilettos",
}

// Local transparent fallback PNGs for gifts not published on Fragment.
const LOCAL_FALLBACK = {
  mask: "/nft/mask.png",
  coffin: "/nft/coffin.png",
  gravestone: "/nft/gravestone.png",
  trojanhorse: "/nft/trojanhorse.png",
  durovsboots: "/nft/durovsboots.png",
  durovscoat: "/nft/durovscoat.png",
}

function pascal(name) {
  return name.replace(/['']/g, "").replace(/[^a-zA-Z0-9 ]/g, "").split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("")
}

async function head(url) {
  try {
    const r = await fetch(url, { method: "HEAD", headers: { "User-Agent": "Mozilla/5.0" } })
    return r.status
  } catch {
    return 0
  }
}

async function resolveImg(id, name) {
  if (LOCAL_FALLBACK[id]) return { url: LOCAL_FALLBACK[id], ok: true }
  const candidates = []
  if (SLUG_OVERRIDES[id]) candidates.push(SLUG_OVERRIDES[id])
  candidates.push(pascal(name))
  candidates.push(name.replace(/['']/g, "").replace(/[^a-zA-Z0-9]/g, ""))
  for (const slug of [...new Set(candidates)]) {
    const url = `https://nft.fragment.com/gift/${slug}-1.webp`
    const code = await head(url)
    if (code === 200) return { url, ok: true }
  }
  // t.me CDN og:image fallback
  for (const slug of [...new Set(candidates)]) {
    try {
      const html = await (await fetch(`https://t.me/nft/${slug}-1`, { headers: { "User-Agent": "Mozilla/5.0" } })).text()
      const m = html.match(/<meta property="og:image" content="([^"]+)"/)
      if (m && m[1] && m[1].includes("cdn")) return { url: m[1], ok: true }
    } catch {}
  }
  return { url: "", ok: false }
}

const results = []
const BATCH = 8
for (let i = 0; i < GIFTS.length; i += BATCH) {
  const slice = GIFTS.slice(i, i + BATCH)
  const resolved = await Promise.all(slice.map(async ([id, name, price]) => {
    const { url, ok } = await resolveImg(id, name)
    return { id, name, price, url, ok }
  }))
  results.push(...resolved)
  process.stderr.write(`probed ${Math.min(i + BATCH, GIFTS.length)}/${GIFTS.length}\n`)
}

const failed = results.filter((r) => !r.ok)
process.stderr.write(`FAILED (${failed.length}): ${failed.map((f) => f.id).join(", ")}\n`)

fs.writeFileSync("scripts/catalog-resolved.json", JSON.stringify(results, null, 2))
process.stderr.write("wrote scripts/catalog-resolved.json\n")

// --- Emit lib/casino-data.ts ---
function rarityFor(price) {
  if (price < 5) return "Common"
  if (price < 15) return "Rare"
  if (price < 50) return "Epic"
  return "Legendary"
}

const catalog = results.map((r) => ({ ...r, rarity: rarityFor(r.price) }))

function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

const catalogLines = catalog
  .map((n) => `  { id: "${n.id}", name: "${esc(n.name)}", rarity: "${n.rarity}", price: ${n.price}, img: "${n.url}" },`)
  .join("\n")

// Group into 6 cases by price band. Each case lists ids in its band, plus a
// few higher-tier "jackpot" ids so every case can pay out big.
const byPrice = [...catalog].sort((a, b) => a.price - b.price)
const ids = (lo, hi) => byPrice.filter((n) => n.price >= lo && n.price < hi).map((n) => n.id)

const bands = [
  { id: "starter", name: "Starter Case", price: 0.5, lo: 0, hi: 3 },
  { id: "bronze", name: "Bronze Case", price: 1.5, lo: 3, hi: 5 },
  { id: "silver", name: "Silver Case", price: 4, lo: 5, hi: 9 },
  { id: "gold", name: "Gold Case", price: 8, lo: 9, hi: 20 },
  { id: "diamond", name: "Diamond Case", price: 18, lo: 20, hi: 60 },
  { id: "legendary", name: "Legendary Case", price: 45, lo: 60, hi: Infinity },
]

// jackpot ids: top 3 most expensive gifts, sprinkled into every case for hype.
const jackpot = [...byPrice].slice(-3).map((n) => n.id)

const caseObjs = bands.map((b, i) => {
  let contents = ids(b.lo, b.hi)
  // add the next tier's cheapest couple as upside (except legendary)
  if (i < bands.length - 1) {
    const next = ids(bands[i + 1].lo, bands[i + 1].hi).slice(0, 3)
    contents = contents.concat(next)
  }
  // every case gets a small jackpot chance
  contents = [...new Set(contents.concat(jackpot))]
  const cover = catalog.find((n) => n.id === contents[Math.floor(contents.length / 2)])?.url ?? catalog[0].url
  return { ...b, cover, contents }
})

const casesLines = caseObjs
  .map(
    (c) => `  {
    id: "${c.id}",
    name: "${c.name}",
    price: ${c.price},
    cover: "${c.cover}",
    contents: [${c.contents.map((x) => `"${x}"`).join(", ")}],
  },`,
  )
  .join("\n")

const freeContents = ids(0, 5).slice(0, 10)
const freeCover = catalog.find((n) => n.id === freeContents[0])?.url ?? catalog[0].url

const file = `export type Rarity = "Common" | "Rare" | "Epic" | "Legendary"

export interface Nft {
  id: string
  name: string
  rarity: Rarity
  price: number // floor price in TON
  img: string
}

export const RARITY: Record<
  Rarity,
  { color: string; glow: string; label: string; weight: number }
> = {
  Common: { color: "#9ca3af", glow: "rgba(156,163,175,0.45)", label: "Common", weight: 60 },
  Rare: { color: "#3b9dff", glow: "rgba(59,157,255,0.5)", label: "Rare", weight: 25 },
  Epic: { color: "#c026d3", glow: "rgba(192,38,211,0.55)", label: "Epic", weight: 12 },
  Legendary: { color: "#ffd600", glow: "rgba(255,214,0,0.6)", label: "Legendary", weight: 3 },
}

// Real Telegram Fragment gift catalog (${catalog.length} unique gifts) with live TON floor prices.
// Images load from the Fragment CDN; a few unpublished gifts fall back to local transparent PNGs.
export const CATALOG: Nft[] = [
${catalogLines}
]

export function nftById(id: string): Nft {
  return CATALOG.find((n) => n.id === id) ?? CATALOG[0]
}

export interface CaseDef {
  id: string
  name: string
  price: number
  cover: string
  contents: string[] // nft ids
}

export const CASES: CaseDef[] = [
${casesLines}
]

// Free case — openable once every 24h, modest common/rare drops.
export const FREE_CASE: CaseDef = {
  id: "free-daily",
  name: "Free Daily Case",
  price: 0,
  cover: "${freeCover}",
  contents: [${freeContents.map((x) => `"${x}"`).join(", ")}],
}

export const FREE_CASE_COOLDOWN_MS = 24 * 60 * 60 * 1000

// Weighted random pick from a list of nft ids
export function rollCase(contents: string[]): Nft {
  const items = contents.map(nftById)
  const total = items.reduce((s, n) => s + RARITY[n.rarity].weight, 0)
  let r = Math.random() * total
  for (const n of items) {
    r -= RARITY[n.rarity].weight
    if (r <= 0) return n
  }
  return items[items.length - 1]
}
`

fs.writeFileSync("lib/casino-data.ts", file)
process.stderr.write(`wrote lib/casino-data.ts (${catalog.length} gifts, ${caseObjs.length} cases)\n`)
