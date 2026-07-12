const fs = require('fs');
const path = require('path');

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const LOGIN = process.env.TWITCH_LOGIN;

const GAMES_FILE = path.join(__dirname, '..', 'data', 'recent-games.json');
const DAYS_FILE = path.join(__dirname, '..', 'data', 'stream-days.json');

const MAX_GAMES = 5;
const MAX_INACTIVE_STREAM_DAYS = 7;

// Catégories Twitch à ignorer (pas de vrais jeux)
const EXCLUDED_CATEGORIES = [
  'Just Chatting',
  'Music',
  'Musique',
  'Talk Shows & Podcasts',
  'ASMR',
  'Special Events',
  'Art',
  'Science & Technology',
  'Sports',
  'Food & Drink',
];

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

async function getAppAccessToken() {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new Error(`Erreur token Twitch: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function getCurrentStream(token) {
  const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${LOGIN}`, {
    headers: {
      'Client-Id': CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`Erreur API Twitch: ${res.status}`);
  const data = await res.json();
  return data.data[0] || null; // null si pas en live
}

function todayISO() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

async function main() {
  const token = await getAppAccessToken();
  const stream = await getCurrentStream(token);

  if (!stream) {
    console.log('Pas en live, on ne fait rien.');
    return;
  }

  const gameName = stream.game_name || 'Jeu inconnu';

  if (EXCLUDED_CATEGORIES.some((cat) => cat.toLowerCase() === gameName.toLowerCase())) {
    console.log(`Catégorie "${gameName}" ignorée (pas un jeu).`);
    return;
  }

  const today = todayISO();

  let streamDays = readJson(DAYS_FILE, []);
  let games = readJson(GAMES_FILE, []);

  const changedDays = !streamDays.includes(today);
  if (changedDays) {
    streamDays.push(today);
    streamDays.sort();
  }

  function streamDaysSince(dateStr) {
    return streamDays.filter((d) => d > dateStr).length;
  }

  const before = games.length;
  games = games.filter((g) => streamDaysSince(g.lastPlayed) < MAX_INACTIVE_STREAM_DAYS);
  const removed = before - games.length;

  const existingIndex = games.findIndex((g) => g.name === gameName);
  let changed = changedDays || removed > 0;

  if (existingIndex === -1) {
    games.unshift({ name: gameName, lastPlayed: today });
    changed = true;
  } else if (existingIndex !== 0 || games[existingIndex].lastPlayed !== today) {
    const [entry] = games.splice(existingIndex, 1);
    entry.lastPlayed = today;
    games.unshift(entry);
    changed = true;
  }

  if (games.length > MAX_GAMES) {
    games = games.slice(0, MAX_GAMES);
    changed = true;
  }

  if (changed) {
    writeJson(GAMES_FILE, games);
    writeJson(DAYS_FILE, streamDays);
    console.log('Fichiers mis à jour.');
  } else {
    console.log('Rien à mettre à jour.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
