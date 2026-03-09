const ROUTE_POINTS = [
  {
    idx: 1,
    pt: "p1",
    label: "PT west",
    lon: -9.0,
    lat: 37.9,
    segCountry: "Portugal",
  },
  {
    idx: 2,
    pt: "p2",
    label: "PT–ES",
    lon: -7.0,
    lat: 40.9,
    segCountry: "Spain",
  },
  {
    idx: 3,
    pt: "p3",
    label: "ES–FR",
    lon: -1.7,
    lat: 43.1,
    segCountry: "France",
  },
  {
    idx: 4,
    pt: "p4",
    label: "FR–DE",
    lon: 7.6,
    lat: 48.6,
    segCountry: "Germany",
  },
  {
    idx: 5,
    pt: "p5",
    label: "DE–PL",
    lon: 14.6,
    lat: 51.1,
    segCountry: "Poland",
  },
  {
    idx: 6,
    pt: "p6",
    label: "PL east",
    lon: 23.9,
    lat: 53.0,
    segCountry: null,
  },
];

const COUNTRIES = ["Portugal", "Spain", "France", "Germany", "Poland"];
const COUNTRY_ID_BY_NAME = {
  Portugal: 620,
  Spain: 724,
  France: 250,
  Germany: 276,
  Poland: 616,
};
const COUNTRY_NAME_BY_ID = Object.fromEntries(
  Object.entries(COUNTRY_ID_BY_NAME).map(([name, id]) => [id, name])
);

const CHANNEL_NAME = "great-wall";

//mercator projection parameters must match buildMapSpec exactly
//wall replicate the same projected x-coords without the map.
const PROJ_CENTER = [7.75, 48.5]; //pan the map left/right/up/down
const PROJ_SCALE_K = 1.65; // scale = width * PROJ_SCALE_K, zoom — bigger = more zoomed in
const PROJ_TX_K = 0.5; // translateX = width * PROJ_TX_K, horizontal crop - shifts the whole map left/right
const PROJ_TY_K = 1 / 2.7; // translateY = height * PROJ_TY_K, vertical crop - shifts the whole map up/down

// load data

async function loadTopoJSON() {
  const res = await fetch("/data/countries-50m.json");
  return res.json();
}
//need to delete land-50m cz useless

async function loadUnemployment() {
  const res = await fetch("/data/unemployment.csv");
  const text = await res.text();
  const rows = text.trim().split(/\r?\n/).slice(1);
  return rows.map((line) => {
    const [, country, year, rate] = line.split(",");
    return { country: country.trim(), year: +year, rate: +rate };
  });
}

//replicates Vega's Mercator projection in plain JS so the wall window can
//compute projected x-coords independently without any input from the map

function makeMercatorProject(width, height) {
  const scale = width * PROJ_SCALE_K;
  const tx = width * PROJ_TX_K;
  const ty = height * PROJ_TY_K;

  //project center point to find the offset
  const [cx, cy] = PROJ_CENTER;
  const cxRad = (cx * Math.PI) / 180;
  const cyRad = (cy * Math.PI) / 180;
  const cy_proj = Math.log(Math.tan(Math.PI / 4 + cyRad / 2));

  return function project(lon, lat) {
    const lonRad = (lon * Math.PI) / 180;
    const latRad = (lat * Math.PI) / 180;
    const x = scale * (lonRad - cxRad) + tx;
    const y =
      -scale * (Math.log(Math.tan(Math.PI / 4 + latRad / 2)) - cy_proj) + ty;
    return [x, y];
  };
}

//compute projected x-coords for all route points given a canvas size
function computeXCoords(width, height) {
  const project = makeMercatorProject(width, height);
  return ROUTE_POINTS.map((p) => project(p.lon, p.lat)[0]);
}

//vega spec

function buildMapSpec(topoData, mapW, mapH, selectedCountries) {
  const selectedCountryIds = Array.isArray(selectedCountries)
    ? selectedCountries
        .map((name) => COUNTRY_ID_BY_NAME[name])
        .filter((id) => typeof id === "number")
    : [];
  return {
    $schema: "https://vega.github.io/schema/vega/v5.json",
    width: mapW,
    height: mapH,
    // padding: 10,
    background: "#dce8f0",
    autosize: "none",

    signals: [
      {
        name: "selectedCountryIds",
        value: selectedCountryIds,
      },
    ],

    data: [
      {
        name: "countries",
        values: topoData,
        format: { type: "topojson", feature: "countries" },
      },
    ],

    projections: [
      {
        name: "proj",
        type: "mercator",
        center: PROJ_CENTER,
        scale: { signal: `width * ${PROJ_SCALE_K}` },
        translate: [
          { signal: `width * ${PROJ_TX_K}` },
          { signal: `height * ${PROJ_TY_K}` },
        ],
      },
    ],

    marks: [
      {
        type: "rect",
        encode: {
          enter: {
            x: { value: 0 },
            y: { value: 0 },
            x2: { signal: "width" },
            y2: { signal: "height" },
            fill: { value: "#dce8f0" },
          },
        },
      },
      {
        name: "mapShape",
        type: "shape",
        from: { data: "countries" },
        transform: [{ type: "geoshape", projection: "proj" }],
        encode: {
          enter: { stroke: { value: "#000000" }, strokeWidth: { value: 0.7 } },
          update: {
            fill: [
              {
                test: "indexof(selectedCountryIds, toNumber(datum.id)) >= 0",
                value: "#a9d3ff",
              },
              { value: "#4a5a6a" },
            ],
          },
        },
      },
    ],
  };
}

// adjust to align wall points with map points
const WALL_PADDING_LEFT = 0;
const WALL_PADDING_RIGHT = 50;

function buildWallSpec(
  xCoords,
  unemploymentData,
  selectedCountries,
  wallHeight,
  containerWidth
) {
  // selectedCountries: [] = show all, otherwise only show selected country columns
  const vegaPad = 16;
  // const targetWidth = (containerWidth || 900) - vegaPad;
  const targetWidth =
    (containerWidth || 900) - WALL_PADDING_LEFT - WALL_PADDING_RIGHT - vegaPad;
  const mapX0 = xCoords[0];
  const mapX1 = xCoords[xCoords.length - 1];
  const mapSpan = mapX1 - mapX0;
  const toWall = (x) => ((x - mapX0) / mapSpan) * targetWidth;

  // const years = [
  //   2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013,
  // ];
  // const years = [2024, 2023, 2022, 2021, 2020];
  const years = [2024, 2018, 2012, 2006, 2000, 1994];
  const nYears = years.length;
  const brickH = Math.max(12, Math.floor((wallHeight - 40) / nYears));

  const segMetrics = COUNTRIES.map((country, i) => ({
    country,
    x1: xCoords[i],
    x2: xCoords[i + 1],
  }));

  const selectedCountrySet = new Set(selectedCountries || []);
  const hasSelection = selectedCountrySet.size > 0;
  const bricks = [];
  for (let si = 0; si < segMetrics.length; si++) {
    const seg = segMetrics[si];
    const wx1 = toWall(xCoords[si]);
    const wx2 = toWall(xCoords[si + 1]);
    const scaledW = wx2 - wx1;
    const cData = unemploymentData.filter((d) => d.country === seg.country);
    const isVisible = hasSelection && selectedCountrySet.has(seg.country);
    for (let yi = 0; yi < years.length; yi++) {
      const yr = years[yi];
      const rec = cData.find((d) => d.year === yr);
      bricks.push({
        country: seg.country,
        year: yr,
        rate: rec ? rec.rate : null,
        x: wx1,
        y: yi * brickH,
        w: scaledW,
        h: brickH - 1,
        visible: isVisible,
      });
    }
  }
  const wallHeightPx = nYears * brickH - 8;

  const labelMarks = COUNTRIES.map((ctry) => {
    const si = segMetrics.findIndex((s) => s.country === ctry);
    if (si < 0) return null;
    const wx1 = toWall(xCoords[si]);
    const wx2 = toWall(xCoords[si + 1]);
    const colW = wx2 - wx1;
    return {
      type: "text",
      encode: {
        enter: {
          x: { value: wx1 + colW / 2 },
          // y: { value: (nYears * brickH) / 2 + 35 },
          y: { value: nYears * brickH - brickH * 1.5 },
          align: { value: "center" },
          baseline: { value: "middle" },
          fontSize: { value: Math.min(17, colW / 6) },
          fontWeight: { value: "bold" },
          fill: { value: "#ffffff" },
          // fill: { value: "#000000" },
          // stroke: { value: "#ffffff" },
          // strokeWidth: { value: 0.7 },
          text: { value: ctry },
        },
      },
    };
  }).filter(Boolean);

  return {
    $schema: "https://vega.github.io/schema/vega/v5.json",
    width: Math.round(targetWidth),
    height: wallHeightPx + 30,

    padding: {
      left: WALL_PADDING_LEFT,
      right: WALL_PADDING_RIGHT,
      top: 0,
      bottom: 0,
    },
    background: "#ffffff",

    data: [
      { name: "bricks", values: bricks },
    ],

    scales: [
      {
        name: "color",
        type: "sequential",
        domain: [2.5, 26],
        range: { scheme: "orangered" },
      },
    ],

    marks: [
      {
        type: "rect",
        from: { data: "bricks" },
        encode: {
          enter: {
            x: { field: "x" },
            y: { field: "y" },
            width: { field: "w" },
            height: { field: "h" },
            tooltip: {
              signal:
                "{'Country': datum.country, 'Year': datum.year, 'Unemployment': format(datum.rate, '.1f') + '%'}",
            },
            cursor: { value: "pointer" },
          },
          update: {
            fill: [
              { test: "datum.rate == null", value: "#333" },
              { scale: "color", field: "rate" },
            ],
            opacity: [{ test: "!datum.visible", value: 0 }, { value: 1.0 }],
            stroke: [{ value: "#ffffff" }],
            strokeWidth: [{ value: 3.5 }],
          },
        },
      },

      ...labelMarks,
    ],
  };
}

//window 1 (map)

async function initMap() {
  const topoData = await loadTopoJSON();

  const ch = new BroadcastChannel(CHANNEL_NAME);
  const win1El = document.getElementById("win1");
  const appEl = document.getElementById("app");

  let mapView = null;
  let selectedCountries = [];

  function getMapSize() {
    const h = appEl.clientHeight;
    return { w: win1El.clientWidth || 900, h: Math.max(300, h) };
  }

  async function renderMap() {
    const { w, h } = getMapSize();
    const spec = buildMapSpec(topoData, w, h, selectedCountries);
    if (mapView) mapView.finalize();
    const res = await vegaEmbed(win1El, spec, {
      renderer: "canvas",
      actions: false,
    });
    mapView = res.view;

    mapView.addEventListener("click", async (_event, item) => {
      if (!item || item.mark.name !== "mapShape") return;
      const name = COUNTRY_NAME_BY_ID[item.datum.id];
      if (!name) return;
      const alreadySelected = selectedCountries.includes(name);
      selectedCountries = alreadySelected
        ? selectedCountries.filter((ctry) => ctry !== name)
        : [...selectedCountries, name];
      ch.postMessage({ type: "select", selectedCountries });
      await renderMap();
    });
  }

  //only listen for selection changes from the wall window
  ch.onmessage = (e) => {
    if (e.data.type === "select") {
      selectedCountries = e.data.selectedCountries || [];
      renderMap();
    }
  };

  await renderMap();

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(async () => {
      await renderMap();
    }, 200);
  });
}

//window 2 (wall)

async function initWall() {
  const unemploymentData = await loadUnemployment();

  const ch = new BroadcastChannel(CHANNEL_NAME);
  const win2El = document.getElementById("win2");

  let wallEmbedResult = null;
  let selectedCountries = [];

  // return { w: window.innerWidth || 900, h: window.innerHeight || 400 };
  function getWallSize() {
    const titleHeight = 70; // adjust title area
    return {
      w: window.innerWidth || 900,
      h: (window.innerHeight || 400) - titleHeight,
    };
  }

  async function renderWall() {
    const { w, h } = getWallSize();
    //compute projected x-coords directly — no map window needed
    const xCoords = computeXCoords(w, h);
    const spec = buildWallSpec(
      xCoords,
      unemploymentData,
      selectedCountries,
      h,
      w
    );

    if (wallEmbedResult) wallEmbedResult.view.finalize();
    wallEmbedResult = await vegaEmbed(win2El, spec, {
      renderer: "canvas",
      actions: false,
    });

    wallEmbedResult.view.addEventListener("click", (_event, item) => {
      if (!item || item.mark.type !== "rect") return;
      const country = item.datum.country;
      const alreadySelected = selectedCountries.includes(country);
      selectedCountries = alreadySelected
        ? selectedCountries.filter((ctry) => ctry !== country)
        : [...selectedCountries, country];
      ch.postMessage({ type: "select", selectedCountries });
      renderWall();
    });
  }

  //0nly listen for selection changes from the map window
  ch.onmessage = (e) => {
    if (e.data.type === "select") {
      selectedCountries = e.data.selectedCountries || [];
      renderWall();
    }
  };

  await renderWall();

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderWall(), 200);
  });
}

const windowType = document.body.dataset.window;
if (windowType === "map") initMap();
else if (windowType === "wall") initWall();
