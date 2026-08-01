export type Rarity = "Common" | "Rare" | "Epic" | "Legendary"

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

// Gifts that exist in the database (players may still own them) but must NOT
// appear in any game — cases, upgrade, rocket, or catalog. They stay in
// ALL_NFTS so owned copies still resolve via nftById for inventory display.
export const HIDDEN_NFT_IDS = new Set(["durovsboots", "durovscoat", "gravestone", "coffin"])

// Real Telegram Fragment gift catalog (118 unique gifts) with live TON floor prices.
// Images load from the Fragment CDN; a few unpublished gifts fall back to local transparent PNGs.
const ALL_NFTS: Nft[] = [
  { id: "chillflame", name: "Chill Flame", rarity: "Common", price: 2.53, img: "https://nft.fragment.com/gift/ChillFlame-1.webp" },
  { id: "vicecream", name: "Vice Cream", rarity: "Common", price: 2.52, img: "https://nft.fragment.com/gift/ViceCream-1.webp" },
  { id: "candycane", name: "Candy Cane", rarity: "Common", price: 2.51, img: "https://nft.fragment.com/gift/CandyCane-1.webp" },
  { id: "lunarsnake", name: "Lunar Snake", rarity: "Common", price: 2.52, img: "https://nft.fragment.com/gift/LunarSnake-1.webp" },
  { id: "whipcupcake", name: "Whip Cupcake", rarity: "Common", price: 2.53, img: "https://nft.fragment.com/gift/WhipCupcake-1.webp" },
  { id: "snakebox", name: "Snake Box", rarity: "Common", price: 2.53, img: "https://nft.fragment.com/gift/SnakeBox-1.webp" },
  { id: "xmasstocking", name: "Xmas Stocking", rarity: "Common", price: 2.53, img: "https://nft.fragment.com/gift/XmasStocking-1.webp" },
  { id: "instantramen", name: "Instant Ramen", rarity: "Common", price: 2.53, img: "https://nft.fragment.com/gift/InstantRamen-1.webp" },
  { id: "bigyear", name: "Big Year", rarity: "Common", price: 2.63, img: "https://nft.fragment.com/gift/BigYear-1.webp" },
  { id: "holidaydrink", name: "Holiday Drink", rarity: "Common", price: 2.71, img: "https://nft.fragment.com/gift/HolidayDrink-1.webp" },
  { id: "winterwreath", name: "Winter Wreath", rarity: "Common", price: 2.56, img: "https://nft.fragment.com/gift/WinterWreath-1.webp" },
  { id: "icecream", name: "Ice Cream", rarity: "Common", price: 2.67, img: "https://nft.fragment.com/gift/IceCream-1.webp" },
  { id: "lolpop", name: "Lol Pop", rarity: "Common", price: 2.75, img: "https://nft.fragment.com/gift/LolPop-1.webp" },
  { id: "petsnake", name: "Pet Snake", rarity: "Common", price: 2.71, img: "https://nft.fragment.com/gift/PetSnake-1.webp" },
  { id: "poolfloat", name: "Pool Float", rarity: "Common", price: 2.84, img: "https://nft.fragment.com/gift/PoolFloat-1.webp" },
  { id: "easteregg", name: "Easter Egg", rarity: "Common", price: 2.84, img: "https://nft.fragment.com/gift/EasterEgg-1.webp" },
  { id: "hypnolollipop", name: "Hypno Lollipop", rarity: "Common", price: 2.83, img: "https://nft.fragment.com/gift/HypnoLollipop-1.webp" },
  { id: "jesterhat", name: "Jester Hat", rarity: "Common", price: 2.9, img: "https://nft.fragment.com/gift/JesterHat-1.webp" },
  { id: "santahat", name: "Santa Hat", rarity: "Common", price: 2.78, img: "https://nft.fragment.com/gift/SantaHat-1.webp" },
  { id: "tamagadget", name: "Tama Gadget", rarity: "Common", price: 2.76, img: "https://nft.fragment.com/gift/TamaGadget-1.webp" },
  { id: "gingercookie", name: "Ginger Cookie", rarity: "Common", price: 2.98, img: "https://nft.fragment.com/gift/GingerCookie-1.webp" },
  { id: "jackinthebox", name: "Jack In The Box", rarity: "Common", price: 2.91, img: "https://nft.fragment.com/gift/JackInTheBox-1.webp" },
  { id: "partysparkler", name: "Party Sparkler", rarity: "Common", price: 2.98, img: "https://nft.fragment.com/gift/PartySparkler-1.webp" },
  { id: "hexpot", name: "Hex Pot", rarity: "Common", price: 3.24, img: "https://nft.fragment.com/gift/HexPot-1.webp" },
  { id: "happybrownie", name: "Happy Brownie", rarity: "Common", price: 3.08, img: "https://nft.fragment.com/gift/HappyBrownie-1.webp" },
  { id: "freshsocks", name: "Fresh Socks", rarity: "Common", price: 3.09, img: "https://nft.fragment.com/gift/FreshSocks-1.webp" },
  { id: "moodpack", name: "Mood Pack", rarity: "Common", price: 3.07, img: "https://nft.fragment.com/gift/MoodPack-1.webp" },
  { id: "stellarrocket", name: "Stellar Rocket", rarity: "Common", price: 3.53, img: "https://nft.fragment.com/gift/StellarRocket-1.webp" },
  { id: "moneypot", name: "Money Pot", rarity: "Common", price: 3.14, img: "https://nft.fragment.com/gift/MoneyPot-1.webp" },
  { id: "prettyposy", name: "Pretty Posy", rarity: "Common", price: 3.49, img: "https://nft.fragment.com/gift/PrettyPosy-1.webp" },
  { id: "snowmittens", name: "Snow Mittens", rarity: "Common", price: 3.27, img: "https://nft.fragment.com/gift/SnowMittens-1.webp" },
  { id: "starnotepad", name: "Star Notepad", rarity: "Common", price: 3.22, img: "https://nft.fragment.com/gift/StarNotepad-1.webp" },
  { id: "cookieheart", name: "Cookie Heart", rarity: "Common", price: 3.43, img: "https://nft.fragment.com/gift/CookieHeart-1.webp" },
  { id: "spicedwine", name: "Spiced Wine", rarity: "Common", price: 3.23, img: "https://nft.fragment.com/gift/SpicedWine-1.webp" },
  { id: "snowglobe", name: "Snow Globe", rarity: "Common", price: 3.37, img: "https://nft.fragment.com/gift/SnowGlobe-1.webp" },
  { id: "moussecake", name: "Mousse Cake", rarity: "Common", price: 3.58, img: "https://nft.fragment.com/gift/MousseCake-1.webp" },
  { id: "timelessbook", name: "Timeless Book", rarity: "Common", price: 3.24, img: "https://nft.fragment.com/gift/TimelessBook-1.webp" },
  { id: "swagbag", name: "Swag Bag", rarity: "Common", price: 3.79, img: "https://nft.fragment.com/gift/SwagBag-1.webp" },
  { id: "witchhat", name: "Witch Hat", rarity: "Common", price: 3.77, img: "https://nft.fragment.com/gift/WitchHat-1.webp" },
  { id: "homemadecake", name: "Homemade Cake", rarity: "Common", price: 3.71, img: "https://nft.fragment.com/gift/HomemadeCake-1.webp" },
  { id: "cloverpin", name: "Clover Pin", rarity: "Common", price: 3.82, img: "https://nft.fragment.com/gift/CloverPin-1.webp" },
  { id: "springbasket", name: "Spring Basket", rarity: "Common", price: 3.95, img: "https://nft.fragment.com/gift/SpringBasket-1.webp" },
  { id: "victorymedal", name: "Victory Medal", rarity: "Common", price: 3.45, img: "https://nft.fragment.com/gift/VictoryMedal-1.webp" },
  { id: "bdaycandle", name: "B-Day Candle", rarity: "Common", price: 3.4, img: "https://nft.fragment.com/gift/BDayCandle-1.webp" },
  { id: "restlessjar", name: "Restless Jar", rarity: "Common", price: 3.71, img: "https://nft.fragment.com/gift/RestlessJar-1.webp" },
  { id: "faithamulet", name: "Faith Amulet", rarity: "Common", price: 3.77, img: "https://nft.fragment.com/gift/FaithAmulet-1.webp" },
  { id: "inputkey", name: "Input Key", rarity: "Common", price: 4.34, img: "https://nft.fragment.com/gift/InputKey-1.webp" },
  { id: "spyagaric", name: "Spy Agaric", rarity: "Common", price: 3.91, img: "https://nft.fragment.com/gift/SpyAgaric-1.webp" },
  { id: "bowtie", name: "Bow Tie", rarity: "Common", price: 3.75, img: "https://nft.fragment.com/gift/BowTie-1.webp" },
  { id: "deskcalendar", name: "Desk Calendar", rarity: "Common", price: 4.06, img: "https://nft.fragment.com/gift/DeskCalendar-1.webp" },
  { id: "snoopdog", name: "Snoop Dog", rarity: "Common", price: 4.27, img: "https://nft.fragment.com/gift/SnoopDogg-1.webp" },
  { id: "moonpendant", name: "Moon Pendant", rarity: "Common", price: 4.59, img: "https://nft.fragment.com/gift/MoonPendant-1.webp" },
  { id: "lushbouquet", name: "Lush Bouquet", rarity: "Common", price: 4.18, img: "https://nft.fragment.com/gift/LushBouquet-1.webp" },
  { id: "eternalcandle", name: "Eternal Candle", rarity: "Common", price: 4.22, img: "https://nft.fragment.com/gift/EternalCandle-1.webp" },
  { id: "lightsword", name: "Light Sword", rarity: "Common", price: 5.17, img: "https://nft.fragment.com/gift/LightSword-1.webp" },
  { id: "sleighbell", name: "Sleigh Bell", rarity: "Rare", price: 5.28, img: "https://nft.fragment.com/gift/SleighBell-1.webp" },
  { id: "jinglebells", name: "Jingle Bells", rarity: "Rare", price: 5.63, img: "https://nft.fragment.com/gift/JingleBells-1.webp" },
  { id: "jellybunny", name: "Jelly Bunny", rarity: "Rare", price: 5.6, img: "https://nft.fragment.com/gift/JellyBunny-1.webp" },
  { id: "evileye", name: "Evil Eye", rarity: "Rare", price: 5.57, img: "https://nft.fragment.com/gift/EvilEye-1.webp" },
  { id: "joyfulbundle", name: "Joyful Bundle", rarity: "Rare", price: 5.53, img: "https://nft.fragment.com/gift/JoyfulBundle-1.webp" },
  { id: "jollychimp", name: "Jolly Chimp", rarity: "Rare", price: 5.78, img: "https://nft.fragment.com/gift/JollyChimp-1.webp" },
  { id: "berrybox", name: "Berry Box", rarity: "Rare", price: 6.18, img: "https://nft.fragment.com/gift/BerryBox-1.webp" },
  { id: "hangingstar", name: "Hanging Star", rarity: "Rare", price: 6.27, img: "https://nft.fragment.com/gift/HangingStar-1.webp" },
  { id: "bunnymuffin", name: "Bunny Muffin", rarity: "Rare", price: 5.57, img: "https://nft.fragment.com/gift/BunnyMuffin-1.webp" },
  { id: "tophat", name: "Top Hat", rarity: "Rare", price: 6.98, img: "https://nft.fragment.com/gift/TopHat-1.webp" },
  { id: "valentinebox", name: "Valentine Box", rarity: "Rare", price: 7.21, img: "https://nft.fragment.com/gift/ValentineBox-1.webp" },
  { id: "lovecandle", name: "Love Candle", rarity: "Rare", price: 6.71, img: "https://nft.fragment.com/gift/LoveCandle-1.webp" },
  { id: "sakuraflower", name: "Sakura Flower", rarity: "Rare", price: 7.66, img: "https://nft.fragment.com/gift/SakuraFlower-1.webp" },
  { id: "skullflower", name: "Skull Flower", rarity: "Rare", price: 8.3, img: "https://nft.fragment.com/gift/SkullFlower-1.webp" },
  { id: "recordplayer", name: "Record Player", rarity: "Rare", price: 8.19, img: "https://nft.fragment.com/gift/RecordPlayer-1.webp" },
  { id: "crystalball", name: "Crystal Ball", rarity: "Rare", price: 9.25, img: "https://nft.fragment.com/gift/CrystalBall-1.webp" },
  { id: "snoopcigar", name: "Snoop Cigar", rarity: "Rare", price: 9.59, img: "https://nft.fragment.com/gift/SnoopCigar-1.webp" },
  { id: "flyingbroom", name: "Flying Broom", rarity: "Rare", price: 8.59, img: "https://nft.fragment.com/gift/FlyingBroom-1.webp" },
  { id: "madpumpkin", name: "Mad Pumpkin", rarity: "Rare", price: 8.9, img: "https://nft.fragment.com/gift/MadPumpkin-1.webp" },
  { id: "trappedheart", name: "Trapped Heart", rarity: "Rare", price: 9.91, img: "https://nft.fragment.com/gift/TrappedHeart-1.webp" },
  { id: "ionicdryer", name: "Ionic Dryer", rarity: "Rare", price: 10.6, img: "https://nft.fragment.com/gift/IonicDryer-1.webp" },
  { id: "ufcstrike", name: "UFC Strike", rarity: "Rare", price: 11.86, img: "https://nft.fragment.com/gift/UFCStrike-1.webp" },
  { id: "lovepotion", name: "Love Potion", rarity: "Rare", price: 10.98, img: "https://nft.fragment.com/gift/LovePotion-1.webp" },
  { id: "skystiletto", name: "Sky Stiletto", rarity: "Rare", price: 13.18, img: "https://nft.fragment.com/gift/SkyStilettos-1.webp" },
  { id: "cupidcharm", name: "Cupid Charm", rarity: "Epic", price: 16.94, img: "https://nft.fragment.com/gift/CupidCharm-1.webp" },
  { id: "khabibspapakha", name: "Khabib's Papakha", rarity: "Epic", price: 18.04, img: "https://nft.fragment.com/gift/KhabibsPapakha-1.webp" },
  { id: "coffin", name: "Coffin", rarity: "Epic", price: 17.98, img: "/nft/coffin.png" },
  { id: "eternalrose", name: "Eternal Rose", rarity: "Epic", price: 19.48, img: "https://nft.fragment.com/gift/EternalRose-1.webp" },
  { id: "rarebird", name: "Rare Bird", rarity: "Epic", price: 19.78, img: "https://nft.fragment.com/gift/RareBird-1.webp" },
  { id: "blingbinky", name: "Bling Binky", rarity: "Epic", price: 18.89, img: "https://nft.fragment.com/gift/BlingBinky-1.webp" },
  { id: "diamondring", name: "Diamond Ring", rarity: "Epic", price: 22.9, img: "https://nft.fragment.com/gift/DiamondRing-1.webp" },
  { id: "electricskull", name: "Electric Skull", rarity: "Epic", price: 20.89, img: "https://nft.fragment.com/gift/ElectricSkull-1.webp" },
  { id: "voodoodoll", name: "Voodoo Doll", rarity: "Epic", price: 26.6, img: "https://nft.fragment.com/gift/VoodooDoll-1.webp" },
  { id: "signetring", name: "Signet Ring", rarity: "Epic", price: 25.79, img: "https://nft.fragment.com/gift/SignetRing-1.webp" },
  { id: "vintagecigar", name: "Vintage Cigar", rarity: "Epic", price: 26.8, img: "https://nft.fragment.com/gift/VintageCigar-1.webp" },
  { id: "toybear", name: "Toy Bear", rarity: "Epic", price: 30.25, img: "https://nft.fragment.com/gift/ToyBear-1.webp" },
  { id: "nekohelmet", name: "Neko Helmet", rarity: "Epic", price: 27.97, img: "https://nft.fragment.com/gift/NekoHelmet-1.webp" },
  { id: "bondedring", name: "Bonded Ring", rarity: "Epic", price: 31.84, img: "https://nft.fragment.com/gift/BondedRing-1.webp" },
  { id: "genielamp", name: "Genie Lamp", rarity: "Epic", price: 29.2, img: "https://nft.fragment.com/gift/GenieLamp-1.webp" },
  { id: "sharptongue", name: "Sharp Tongue", rarity: "Epic", price: 33.99, img: "https://nft.fragment.com/gift/SharpTongue-1.webp" },
  { id: "kissedfrog", name: "Kissed Frog", rarity: "Epic", price: 34.99, img: "https://nft.fragment.com/gift/KissedFrog-1.webp" },
  { id: "swisswatch", name: "Swiss Watch", rarity: "Epic", price: 35.7, img: "https://nft.fragment.com/gift/SwissWatch-1.webp" },
  { id: "lowrider", name: "Low Rider", rarity: "Epic", price: 37.99, img: "https://nft.fragment.com/gift/LowRider-1.webp" },
  { id: "gravestone", name: "Gravestone", rarity: "Epic", price: 41.92, img: "/nft/gravestone.png" },
  { id: "magicpotion", name: "Magic Potion", rarity: "Epic", price: 44.22, img: "https://nft.fragment.com/gift/MagicPotion-1.webp" },
  { id: "gemsignet", name: "Gem Signet", rarity: "Legendary", price: 49.19, img: "https://nft.fragment.com/gift/GemSignet-1.webp" },
  { id: "trojanhorse", name: "Trojan Horse", rarity: "Legendary", price: 48.12, img: "/nft/trojanhorse.png" },
  { id: "artisanbrick", name: "Artisan Brick", rarity: "Legendary", price: 48.58, img: "https://nft.fragment.com/gift/ArtisanBrick-1.webp" },
  { id: "westsidesign", name: "Westside Sign", rarity: "Legendary", price: 59.66, img: "https://nft.fragment.com/gift/WestSideSign-1.webp" },
  { id: "perfumebottle", name: "Perfume Bottle", rarity: "Legendary", price: 55.89, img: "https://nft.fragment.com/gift/PerfumeBottle-1.webp" },
  { id: "iongem", name: "Ion Gem", rarity: "Legendary", price: 54.39, img: "https://nft.fragment.com/gift/IonGem-1.webp" },
  { id: "minioscar", name: "Mini Oscar", rarity: "Legendary", price: 57.89, img: "https://nft.fragment.com/gift/MiniOscar-1.webp" },
  { id: "durovsboots", name: "Durov's Boots", rarity: "Legendary", price: 64.79, img: "/nft/durovsboots.png" },
  { id: "durovscoat", name: "Durov's Coat", rarity: "Legendary", price: 70.05, img: "/nft/durovscoat.png" },
  { id: "nailbracelet", name: "Nail Bracelet", rarity: "Legendary", price: 80.79, img: "https://nft.fragment.com/gift/NailBracelet-1.webp" },
  { id: "lootbag", name: "Loot Bag", rarity: "Legendary", price: 92.49, img: "https://nft.fragment.com/gift/LootBag-1.webp" },
  { id: "mightyarm", name: "Mighty Arm", rarity: "Legendary", price: 97.89, img: "https://nft.fragment.com/gift/MightyArm-1.webp" },
  { id: "astralshard", name: "Astral Shard", rarity: "Legendary", price: 112.99, img: "https://nft.fragment.com/gift/AstralShard-1.webp" },
  { id: "scaredcat", name: "Scared Cat", rarity: "Legendary", price: 147.99, img: "https://nft.fragment.com/gift/ScaredCat-1.webp" },
  { id: "heroichelmet", name: "Heroic Helmet", rarity: "Legendary", price: 156.95, img: "https://nft.fragment.com/gift/HeroicHelmet-1.webp" },
  { id: "preciouspeach", name: "Precious Peach", rarity: "Legendary", price: 235.98, img: "https://nft.fragment.com/gift/PreciousPeach-1.webp" },
]

// Game-visible catalog: every game (cases, upgrade, rocket) and the catalog
// screen draw from this filtered list, so hidden gifts never surface in play.
export const CATALOG: Nft[] = ALL_NFTS.filter((n) => !HIDDEN_NFT_IDS.has(n.id))

// Resolve any NFT by id against the FULL master list (including hidden gifts),
// so players who already own a hidden gift still see it in their inventory.
export function nftById(id: string): Nft {
  return ALL_NFTS.find((n) => n.id === id) ?? ALL_NFTS[0]
}

// Dynamic minimum NFT threshold — always the lowest floor price in the catalog.
export const MIN_NFT_PRICE = CATALOG.reduce((min, n) => (n.price < min ? n.price : min), Number.POSITIVE_INFINITY)

// Returns the NFT whose floor price is closest to but not exceeding `ton`.
// Returns null when `ton` is below the cheapest NFT in the catalog.
export function bestNftForWinnings(ton: number): Nft | null {
  let best: Nft | null = null
  for (const n of CATALOG) {
    if (n.price <= ton && (best === null || n.price > best.price)) best = n
  }
  return best
}

// Spaced-out tier list for the Rocket player cards. The full catalog has many
// items only 0.01-0.05 TON apart, which makes the NFT on a card flicker between
// near-identical gifts as the multiplier ticks up. We pre-compute a subset where
// each tier is at least ROCKET_TIER_GAP TON above the previous one, so the
// displayed reward changes in meaningful steps.
const ROCKET_TIER_GAP = 0.2
export const ROCKET_TIERS: Nft[] = (() => {
  const sorted = [...CATALOG].sort((a, b) => a.price - b.price)
  const tiers: Nft[] = []
  let lastPrice = Number.NEGATIVE_INFINITY
  for (const n of sorted) {
    if (n.price - lastPrice >= ROCKET_TIER_GAP) {
      tiers.push(n)
      lastPrice = n.price
    }
  }
  return tiers
})()

// Rocket-card variant of bestNftForWinnings: picks from the spaced tier list so
// consecutive rewards always differ by a noticeable amount.
export function bestRocketNftForWinnings(ton: number): Nft | null {
  let best: Nft | null = null
  for (const n of ROCKET_TIERS) {
    if (n.price <= ton && (best === null || n.price > best.price)) best = n
  }
  return best
}

export interface CaseDef {
  id: string
  name: string
  price: number
  cover: string
  badge?: string
  contents: CasePrize[]
  // "free" = no payment, cooldown only
  // "deposit" = player must deposit >= price TON since last open (free to open)
  // "referral" = sum of referrals' deposits >= price TON (free to open)
  // "paid" = normal purchase (default / undefined)
  model?: "paid" | "free" | "deposit" | "referral" | "promo"
  cooldownMs?: number // custom cooldown in ms (overrides defaults for free/deposit)
}

export type CasePrize =
  | string
  | { type: "nft"; id: string; chance?: number }
  | { type: "ton"; amount: number; chance?: number }

export type NormalizedCasePrize =
  | { type: "nft"; id: string; chance: number }
  | { type: "ton"; amount: number; chance: number }

export type CaseRollResult =
  | { type: "nft"; nft: Nft; prize: NormalizedCasePrize }
  | { type: "ton"; amount: number; prize: NormalizedCasePrize }

export function normalizePrize(prize: CasePrize): NormalizedCasePrize | null {
  if (typeof prize === "string") {
    const nft = nftById(prize)
    if (!nft || HIDDEN_NFT_IDS.has(nft.id)) return null
    return { type: "nft", id: nft.id, chance: RARITY[nft.rarity].weight }
  }
  if (!prize || typeof prize !== "object") return null
  const chance = Math.max(0, Number(prize.chance) || 0)
  if (prize.type === "ton") {
    const amount = Math.max(0, Number(prize.amount) || 0)
    return amount > 0 ? { type: "ton", amount, chance: Number.isFinite(chance) && prize.chance !== undefined ? chance : amount } : null
  }
  const nft = nftById(String(prize.id))
  if (!nft || HIDDEN_NFT_IDS.has(nft.id)) return null
  return { type: "nft", id: nft.id, chance: Number.isFinite(chance) && prize.chance !== undefined ? chance : RARITY[nft.rarity].weight }
}

export function normalizeCaseContents(contents: CasePrize[]): NormalizedCasePrize[] {
  return (Array.isArray(contents) ? contents : []).map(normalizePrize).filter((p): p is NormalizedCasePrize => p !== null)
}

export const CASES: CaseDef[] = [
  {
    id: "starter",
    name: "Starter Case",
    price: 0.5,
    cover: "https://nft.fragment.com/gift/HypnoLollipop-1.webp",
    contents: ["chillflame", "vicecream", "candycane", "lunarsnake", "whipcupcake", "snakebox", "xmasstocking", "instantramen", "bigyear", "holidaydrink", "winterwreath", "icecream", "lolpop", "petsnake", "poolfloat", "easteregg", "hypnolollipop", "jesterhat", "santahat", "tamagadget", "gingercookie", "jackinthebox", "partysparkler", "hexpot", "happybrownie", "freshsocks", "moodpack", "moneypot", "prettyposy", "heroichelmet", "preciouspeach"],
  },
  {
    id: "bronze",
    name: "Bronze Case",
    price: 1.5,
    cover: "https://nft.fragment.com/gift/BDayCandle-1.webp",
    contents: ["moodpack", "moneypot", "prettyposy", "stellarrocket", "snowmittens", "starnotepad", "cookieheart", "spicedwine", "snowglobe", "moussecake", "timelessbook", "swagbag", "witchhat", "homemadecake", "cloverpin", "springbasket", "victorymedal", "bdaycandle", "restlessjar", "faithamulet", "inputkey", "spyagaric", "bowtie", "deskcalendar", "snoopdog", "moonpendant", "lushbouquet", "eternalcandle", "lightsword", "sleighbell", "jinglebells", "jellybunny", "heroichelmet", "preciouspeach"],
  },
  {
    id: "silver",
    name: "Silver Case",
    price: 4,
    cover: "https://nft.fragment.com/gift/SakuraFlower-1.webp",
    contents: ["sleighbell", "jinglebells", "jellybunny", "evileye", "joyfulbundle", "jollychimp", "berrybox", "hangingstar", "bunnymuffin", "tophat", "valentinebox", "lovecandle", "sakuraflower", "skullflower", "recordplayer", "crystalball", "snoopcigar", "flyingbroom", "madpumpkin", "trappedheart", "ionicdryer", "ufcstrike", "heroichelmet", "preciouspeach"],
  },
  {
    id: "gold",
    name: "Gold Case",
    price: 8,
    cover: "https://nft.fragment.com/gift/EternalRose-1.webp",
    contents: ["trappedheart", "ionicdryer", "ufcstrike", "lovepotion", "skystiletto", "cupidcharm", "khabibspapakha", "coffin", "eternalrose", "rarebird", "blingbinky", "diamondring", "electricskull", "voodoodoll", "heroichelmet", "preciouspeach"],
  },
  {
    id: "diamond",
    name: "Diamond Case",
    price: 18,
    cover: "https://nft.fragment.com/gift/MagicPotion-1.webp",
    contents: ["diamondring", "electricskull", "voodoodoll", "signetring", "vintagecigar", "toybear", "nekohelmet", "bondedring", "genielamp", "sharptongue", "kissedfrog", "swisswatch", "lowrider", "gravestone", "magicpotion", "gemsignet", "trojanhorse", "artisanbrick", "westsidesign", "perfumebottle", "iongem", "minioscar", "durovsboots", "durovscoat", "nailbracelet", "heroichelmet", "preciouspeach"],
  },
  {
    id: "legendary",
    name: "Legendary Case",
    price: 45,
    cover: "https://nft.fragment.com/gift/AstralShard-1.webp",
    contents: ["durovsboots", "durovscoat", "nailbracelet", "lootbag", "mightyarm", "astralshard", "scaredcat", "heroichelmet", "preciouspeach"],
  },
]

// Free case — openable once every 24h, modest common/rare drops.
export const FREE_CASE: CaseDef = {
  id: "free-daily",
  name: "Free Daily Case",
  price: 0,
  cover: "https://nft.fragment.com/gift/ChillFlame-1.webp",
  contents: ["chillflame", "vicecream", "candycane", "lunarsnake", "whipcupcake", "snakebox", "xmasstocking", "instantramen", "bigyear", "holidaydrink"],
}

export const FREE_CASE_COOLDOWN_MS = 24 * 60 * 60 * 1000

// Deposit Case — openable once every 6 days, but only after the player has
// deposited at least 1 TON (via TON or Stars) since their last opening.
export const DEPOSIT_CASE: CaseDef = {
  id: "deposit",
  name: "Deposit Case",
  price: 0,
  cover: "https://nft.fragment.com/gift/SwagBag-1.webp",
  contents: ["snowmittens", "starnotepad", "cookieheart", "spicedwine", "snowglobe", "moussecake", "timelessbook", "swagbag", "witchhat", "homemadecake", "cloverpin", "springbasket", "victorymedal", "sleighbell", "jellybunny", "heroichelmet", "preciouspeach"],
}

export const DEPOSIT_CASE_COOLDOWN_MS = 6 * 24 * 60 * 60 * 1000
export const DEPOSIT_CASE_REQUIRED_TON = 1

// Referral Case — openable when sum of referrals' deposits >= price, with cooldown.
export const REFERRAL_CASE: CaseDef = {
  id: "referral",
  name: "Referral Case",
  price: 1,
  cover: "https://nft.fragment.com/gift/HangingStar-1.webp",
  model: "referral",
  cooldownMs: 7 * 24 * 60 * 60 * 1000,
  contents: ["snowmittens", "starnotepad", "cookieheart", "hangingstar", "bunnymuffin", "tophat", "sakuraflower", "skullflower", "recordplayer", "crystalball"],
}

export const REFERRAL_CASE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

// Promo Case — opened only via a promo code (type "case"). No NFT prizes by
// default (all chance goes to TON micro-prizes), but fully editable from the
// admin panel just like any other case.
export const PROMO_CASE: CaseDef = {
  id: "promo",
  name: "Promo Case",
  price: 0,
  cover: "https://nft.fragment.com/gift/StarNotepad-1.webp",
  model: "promo",
  contents: [
    { type: "ton", amount: 0.05, chance: 900 },
    { type: "ton", amount: 0.10, chance: 100 },
  ],
}

// Strip hidden gifts from every case pool so they can never be rolled or shown.
for (const c of [...CASES, FREE_CASE, DEPOSIT_CASE]) {
  c.contents = normalizeCaseContents(c.contents)
}

/** Weighted pick. Client may use this for reel decoys only — real rewards must
 *  be rolled server-side via rollCaseWithRng(secureRandom). */
export function rollCaseWithRng(contents: CasePrize[], rand: () => number): CaseRollResult {
  const items = normalizeCaseContents(contents)
  const safeItems = items.length ? items : normalizeCaseContents(FREE_CASE.contents)
  const total = safeItems.reduce((s, p) => s + p.chance, 0)
  let r = rand() * total
  for (const p of safeItems) {
    r -= p.chance
    if (r <= 0) return p.type === "ton" ? { type: "ton", amount: p.amount, prize: p } : { type: "nft", nft: nftById(p.id), prize: p }
  }
  const p = safeItems[safeItems.length - 1]
  return p.type === "ton" ? { type: "ton", amount: p.amount, prize: p } : { type: "nft", nft: nftById(p.id), prize: p }
}

/** Visual / demo only — never authoritative for balances or inventory. */
export function rollCase(contents: CasePrize[]): CaseRollResult {
  return rollCaseWithRng(contents, Math.random)
}
