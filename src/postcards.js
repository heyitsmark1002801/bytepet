// Postcards your pet brings back from vacation — from wherever you actually went.

// Country → scene + things your pet "did" there
const COUNTRIES = {
  CA: { name: 'Canada', scene: 'mountains', notes: ['Saw a moose. It did not say sorry.', 'Had poutine for breakfast, lunch and dinner.'] },
  US: { name: 'United States', scene: 'city', notes: ['Everything is SO big here. Even the snacks.', 'Ate a hot dog the size of me.'] },
  MX: { name: 'Mexico', scene: 'tropical', notes: ['Tacos al pastor changed my life.', 'Swam in a cenote. So blue!'] },
  CU: { name: 'Cuba', scene: 'tropical', notes: ['Rode in a 1950s car!', 'Danced salsa until 3 AM.'] },
  BR: { name: 'Brazil', scene: 'tropical', notes: ['Samba lessons: 1. Me: 0.', 'Saw the jungle AND the beach in one day.'] },
  AR: { name: 'Argentina', scene: 'mountains', notes: ['Learned to tango (badly).', 'Ate empanadas at every meal.'] },
  PE: { name: 'Peru', scene: 'mountains', notes: ['A llama judged my outfit.', 'Climbed to the clouds!'] },
  CR: { name: 'Costa Rica', scene: 'forest', notes: ['A sloth waved at me. Slowly.', 'Pura vida!'] },
  GB: { name: 'United Kingdom', scene: 'city', notes: ['It rained. Felt like home.', 'Had tea with the pigeons.'] },
  IE: { name: 'Ireland', scene: 'forest', notes: ['So many shades of green!', 'Looked for a pot of gold. Found sheep.'] },
  FR: { name: 'France', scene: 'tower', notes: ['Ate 4 croissants. Regret nothing.', 'Waved at the Eiffel Tower. It didn\'t wave back.'] },
  DE: { name: 'Germany', scene: 'forest', notes: ['Pretzels as big as my head!', 'Found a cuckoo clock. It found me.'] },
  ES: { name: 'Spain', scene: 'beach', notes: ['Napped at siesta time like a pro.', 'Paella with extra everything.'] },
  PT: { name: 'Portugal', scene: 'beach', notes: ['Pastel de nata x 6.', 'Rode the yellow tram up the hill!'] },
  IT: { name: 'Italy', scene: 'canals', notes: ['Gelato twice a day is a rule here.', 'Rode a gondola. Didn\'t fall in!'] },
  NL: { name: 'Netherlands', scene: 'canals', notes: ['Biked everywhere. Legs = jelly.', 'Tulips! So many tulips!'] },
  BE: { name: 'Belgium', scene: 'city', notes: ['Waffles AND chocolate. Same meal.', 'Fries with mayo. Trust me.'] },
  CH: { name: 'Switzerland', scene: 'mountains', notes: ['Yodeled. An echo yodeled back.', 'So much cheese. So many holes.'] },
  AT: { name: 'Austria', scene: 'mountains', notes: ['Hills alive with music, as promised.', 'Ate strudel in a palace café.'] },
  CZ: { name: 'Czechia', scene: 'city', notes: ['The castle looks like a fairy tale!', 'Watched the clock tower show.'] },
  PL: { name: 'Poland', scene: 'city', notes: ['Pierogi: 30. Me: full.', 'Walked the old town square.'] },
  GR: { name: 'Greece', scene: 'beach', notes: ['Everything is blue and white!', 'Fed olives to a cat.'] },
  TR: { name: 'Türkiye', scene: 'temple', notes: ['Floated in a hot air balloon!', 'Tea, tea, more tea.'] },
  IS: { name: 'Iceland', scene: 'snow', notes: ['Saw the northern lights!', 'A geyser splashed me. Rude.'] },
  NO: { name: 'Norway', scene: 'snow', notes: ['Fjords are just giant pools.', 'Northern lights! Wow!'] },
  SE: { name: 'Sweden', scene: 'forest', notes: ['Built a flat-pack bed. Extra screws.', 'Fika break every hour.'] },
  DK: { name: 'Denmark', scene: 'city', notes: ['Very hygge. Many candles.', 'Rode a bike past a little mermaid.'] },
  FI: { name: 'Finland', scene: 'snow', notes: ['Sauna, then snow. Brr!', 'Visited Santa\'s office.'] },
  RU: { name: 'Russia', scene: 'snow', notes: ['Wore three scarves. Still cold.', 'Onion-shaped roofs everywhere!'] },
  UA: { name: 'Ukraine', scene: 'city', notes: ['Borscht is my new favourite colour.', 'Sunflower fields forever.'] },
  IL: { name: 'Israel', scene: 'beach', notes: ['Floated in the Dead Sea like a cork!', 'Hummus with everything.'] },
  AE: { name: 'United Arab Emirates', scene: 'desert', notes: ['The buildings touch the sky!', 'Rode a camel. It was taller than me.'] },
  SA: { name: 'Saudi Arabia', scene: 'desert', notes: ['Dunes forever!', 'Dates are the best snack.'] },
  EG: { name: 'Egypt', scene: 'pyramids', notes: ['Pyramids! Older than every computer.', 'A camel winked at me.'] },
  MA: { name: 'Morocco', scene: 'desert', notes: ['Got lost in the market. Happily.', 'Mint tea poured from SO high.'] },
  ZA: { name: 'South Africa', scene: 'mountains', notes: ['Saw a penguin on a beach!', 'Table Mountain is flat. Like a table.'] },
  KE: { name: 'Kenya', scene: 'desert', notes: ['Saw a giraffe! So tall!', 'Safari! A lion yawned at me.'] },
  IN: { name: 'India', scene: 'temple', notes: ['So many colours and spices!', 'Chai with a view.'] },
  NP: { name: 'Nepal', scene: 'mountains', notes: ['Highest mountains in the world!', 'Momos, momos, momos.'] },
  JP: { name: 'Japan', scene: 'temple', notes: ['Bowed to a deer. It bowed back!', 'Vending machines everywhere!!'] },
  KR: { name: 'South Korea', scene: 'city', notes: ['Karaoke champion (in my heart).', 'Kimchi with every meal!'] },
  CN: { name: 'China', scene: 'temple', notes: ['Walked a bit of the Great Wall!', 'Dumplings for days.'] },
  HK: { name: 'Hong Kong', scene: 'city', notes: ['Dim sum heaven!', 'The skyline at night!!'] },
  TW: { name: 'Taiwan', scene: 'city', notes: ['Night market snack marathon.', 'Bubble tea. Obviously.'] },
  TH: { name: 'Thailand', scene: 'tropical', notes: ['Mango sticky rice every day.', 'Elephants are gentle giants!'] },
  VN: { name: 'Vietnam', scene: 'tropical', notes: ['Pho for breakfast!', 'So many scooters!'] },
  SG: { name: 'Singapore', scene: 'city', notes: ['Trees made of metal that glow!', 'Ate at a hawker centre. 10/10.'] },
  ID: { name: 'Indonesia', scene: 'tropical', notes: ['Surfed (fell off) 12 times.', 'Rice terraces like giant stairs.'] },
  PH: { name: 'Philippines', scene: 'tropical', notes: ['White sand, blue water!', 'Mango everything.'] },
  AU: { name: 'Australia', scene: 'beach', notes: ['A kangaroo boxed me. I lost.', 'Everything here is upside down!'] },
  NZ: { name: 'New Zealand', scene: 'mountains', notes: ['Looked for hobbits. Found sheep.', 'Bungee jumped (screamed).'] },
  MV: { name: 'Maldives', scene: 'tropical', notes: ['Slept above the ocean!', 'Fish said hi.'] },
};

// Unknown country: pick a scene from the time-zone region
const REGION_SCENE = { Europe: 'city', Asia: 'temple', Africa: 'desert', America: 'mountains', Australia: 'beach', Pacific: 'tropical', Indian: 'tropical', Atlantic: 'beach' };
const GENERIC_NOTES = ['Had the best time! Wish you were here.', 'Tried a new food. Then tried it again.', 'Made a new friend!', 'Took 400 photos. All of food.'];
const STAYCATION_NOTES = ['Napped in every room of the house.', 'Watched clouds all day. 10/10.', 'Read three books. Well, the covers.', 'Best trip ever: the couch.'];

function flag(code) {
  if (!code || !/^[A-Z]{2}$/.test(code)) return '🌍';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

// `loc` = { city, country, countryCode, timezone }; `staycation` = never left home
function makePostcard(loc, { now = Date.now(), hours = 0, staycation = false, rand = Math.random } = {}) {
  const info = loc && loc.countryCode ? COUNTRIES[loc.countryCode] : null;
  const regionScene = loc && loc.timezone ? REGION_SCENE[loc.timezone.split('/')[0]] : null;
  const country = (info && info.name) || (loc && loc.country) || null;
  const city = loc && loc.city;
  const place = [city, country].filter(Boolean).join(', ') || (staycation ? 'Home sweet home' : 'somewhere nice');
  return {
    id: `pc${now.toString(36)}${Math.floor(rand() * 1e4).toString(36)}`,
    place,
    city: city || null,
    country,
    countryCode: (loc && loc.countryCode) || null,
    flag: staycation ? '🏠' : flag(loc && loc.countryCode),
    scene: staycation ? 'home' : (info && info.scene) || regionScene || 'beach',
    note: staycation ? pick(STAYCATION_NOTES, rand) : pick((info && info.notes) || GENERIC_NOTES, rand),
    staycation,
    date: now,
    days: Math.max(1, Math.round(hours / 24)),
  };
}

module.exports = { COUNTRIES, makePostcard, flag };
