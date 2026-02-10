// ============================================================================
// F.I.S.H. PRO ENGINE v33.2
// Find · Inspect · See · Hunt
// Architecture: Probabilistic Decision Support System (PDSS)
// Status: PRODUCTION / EXPLAINABLE / MILITARY-GRADE LOGIC
// ============================================================================

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const SunCalc = require('suncalc');

const app = express();
app.use(cors());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const fetch = globalThis.fetch || require('node-fetch');

// ============================================================================
// 1. SECURITY & CACHE
// ============================================================================

const cache = new NodeCache({ stdTTL: 1800, checkperiod: 300 });

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Rate limit active."
});
app.use('/api/', limiter);

// ============================================================================
// 2. MATH CORE
// ============================================================================

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function getFuzzyScore(val, min, optMin, optMax, max) {
  if (val <= min || val >= max) return 0.15;
  if (val >= optMin && val <= optMax) return 1.0;
  if (val < optMin) return 0.15 + 0.85 * ((val - min) / (optMin - min));
  return 0.15 + 0.85 * ((max - val) / (max - optMax));
}

function bellCurve(val, ideal, sigma) {
  const score = Math.exp(-Math.pow(val - ideal, 2) / (2 * sigma * sigma));
  return Math.max(0.2, score);
}

function estimateCurrent(wave, wind) {
  return Math.max(0.05, wave * 0.35 + wind * 0.018);
}

function uncertaintyNoise(sigma) {
  return (Math.random() * 2 - 1) * sigma;
}

// ============================================================================
// 3. HELPERS
// ============================================================================

function getSeason(month) {
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

function checkActiveTime(active) {
  if (!active) return 1.0;
  const hour = new Date().getHours();
  const ranges = active.match(/(\d+)-(\d+)/g);
  for (let r of ranges) {
    let [s, e] = r.split('-').map(Number);
    if (s > e && (hour >= s || hour <= e)) return 1.0;
    if (hour >= s && hour <= e) return 1.0;
  }
  return 0.65;
}

// ============================================================================
// 4. SPECIES DATABASE (SPORT FISHING)
// ============================================================================

const SPECIES_DB = {
  levrek: {
    name: "Levrek",
    icon: "🐟",
    baseEff: { winter: 0.95, spring: 0.7, summer: 0.4, autumn: 0.9 },
    temp: [7, 11, 19, 23],
    waveIdeal: 0.9,
    waveSigma: 0.5,
    activeTime: "04-09,17-23",
    triggers: ["pressure_drop", "wave_high", "cloud"],
    bait: "Silikon, Rapala",
    method: "Spin",
    note: "Köpüklü ve akıntılı su."
  },

  cipura: {
    name: "Çipura",
    icon: "🐠",
    baseEff: { winter: 0.45, spring: 0.7, summer: 0.6, autumn: 0.95 },
    temp: [14, 17, 24, 28],
    waveIdeal: 0.3,
    waveSigma: 0.3,
    activeTime: "06-11,15-19",
    triggers: ["calm", "stable"],
    bait: "Yengeç, Madya",
    method: "Surf",
    note: "Sakin ve berrak su."
  },

  karagoz: {
    name: "Karagöz",
    icon: "🐟",
    baseEff: { winter: 0.9, spring: 0.7, summer: 0.5, autumn: 0.85 },
    temp: [9, 13, 21, 25],
    waveIdeal: 0.6,
    waveSigma: 0.4,
    activeTime: "19-05",
    triggers: ["night", "turbid"],
    bait: "Midye, Boru kurdu",
    method: "Dip",
    note: "Gece ve bulanık su."
  }
};

// ============================================================================
// 5. API
// ============================================================================

app.get('/api/forecast', async (req, res) => {
  try {
    const lat = Number(parseFloat(req.query.lat).toFixed(2));
    const lon = Number(parseFloat(req.query.lon).toFixed(2));

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: "Invalid coordinates" });
    }

    const cacheKey = `forecast_v33_2_${lat}_${lon}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=temperature_2m,wind_speed_10m,surface_pressure,cloud_cover,rain` +
      `&daily=wind_speed_10m_max,wave_height_max,sunrise,sunset&timezone=auto`;

    const marineUrl =
      `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
      `&hourly=sea_surface_temperature,wave_height&timezone=auto`;

    const [wRes, mRes] = await Promise.all([fetch(weatherUrl), fetch(marineUrl)]);
    const weather = await wRes.json();
    const marine = await mRes.json();

    const hour = new Date().getHours();
    const idx = hour;

    const temp = marine.hourly.sea_surface_temperature[idx];
    const wave = marine.hourly.wave_height[idx];
    const wind = weather.hourly.wind_speed_10m[idx];
    const pressure = weather.hourly.surface_pressure[idx];
    const pressurePrev = weather.hourly.surface_pressure[idx - 3] || pressure;
    const cloud = weather.hourly.cloud_cover[idx];
    const rain = weather.hourly.rain[idx];
    const moon = SunCalc.getMoonIllumination(new Date());

    const pressTrend = pressure - pressurePrev;
    const current = estimateCurrent(wave, wind);

    const chaos =
      clamp((wind / 40 + wave / 3 + Math.abs(pressTrend) / 3) / 3, 0, 1);
    const sigma = 2 + chaos * 6;
    const confidence = clamp(Math.round((1 - chaos) * 100), 30, 95);

    let fishResults = [];

    for (const [key, f] of Object.entries(SPECIES_DB)) {
      let explain = {
        reasons: [],
        penalties: []
      };

      const season = getSeason(new Date().getMonth());
      const s_bio = f.baseEff[season] * 100;

      let f_temp = getFuzzyScore(temp, ...f.temp);
      if (f_temp > 0.8) explain.reasons.push("Su sıcaklığı ideal");

      let f_wave = bellCurve(wave, f.waveIdeal, f.waveSigma);
      if (f_wave < 0.5) explain.penalties.push("Dalga uygun değil");

      let f_current = current > 0.5 ? 1.0 : 0.6;

      let s_press = pressTrend < -1 ? 1.0 : 0.6;
      if (pressTrend < -1) explain.reasons.push("Basınç düşüşü var");

      let s_env =
        (f_temp * 0.3 +
          f_wave * 0.2 +
          f_current * 0.15 +
          s_press * 0.15 +
          (cloud > 40 ? 1 : 0.6) * 0.1 +
          (rain > 0 && rain < 3 ? 1 : 0.7) * 0.1) *
        100 *
        checkActiveTime(f.activeTime);

      let raw =
        s_bio * 0.3 +
        s_env * 0.5 +
        100 * 0.15;

      fishResults.push({
        key,
        name: f.name,
        icon: f.icon,
        raw,
        explain,
        bait: f.bait,
        method: f.method,
        note: f.note
      });
    }

    fishResults.sort((a, b) => b.raw - a.raw);
    const dominant = fishResults[0]?.key;

    const finalFish = fishResults
      .map(f => {
        let score = f.raw;
        if (f.key !== dominant) {
          score *= 0.85;
          f.explain.penalties.push("Baskın tür değil");
        }

        score += uncertaintyNoise(sigma);
        score = clamp(score, 30, 95);

        if (score < 35) return null;

        return {
          name: f.name,
          icon: f.icon,
          score: Number(score.toFixed(1)),
          confidence,
          bait: f.bait,
          method: f.method,
          note: f.note,
          explain: {
            selected: f.key === dominant,
            reasons: f.explain.reasons,
            penalties: f.explain.penalties,
            chaos: chaos.toFixed(2),
            uncertainty: `±${sigma.toFixed(1)}`
          }
        };
      })
      .filter(Boolean);

    const response = {
      version: "v33.2 FINAL",
      dominantSpecies: dominant,
      confidence,
      chaosIndex: chaos.toFixed(2),
      fish: finalFish
    };

    cache.set(cacheKey, response);
    res.json(response);

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () =>
  console.log(`⚓ F.I.S.H. ENGINE v33.2 ACTIVE`)
);
