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

//for eu line graph and chloropleth
const EU_LINE_CHART_COUNTRIES = [
  "Austria",
  "Belgium",
  "Bulgaria",
  "Czech Republic",
  "Denmark",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "Hungary",
  "Ireland",
  "Italy",
  "Luxembourg",
  "Netherlands",
  "Poland",
  "Portugal",
  "Romania",
  "Slovakia",
  "Spain",
  "Sweden",
];
const EU_COUNTRY_IDS = {
  Austria: 40,
  Belgium: 56,
  Bulgaria: 100,
  Croatia: 191,
  Cyprus: 196,
  "Czech Republic": 203,
  Denmark: 208,
  Estonia: 233,
  Finland: 246,
  France: 250,
  Germany: 276,
  Greece: 300,
  Hungary: 348,
  Ireland: 372,
  Italy: 380,
  Latvia: 428,
  Lithuania: 440,
  Luxembourg: 442,
  Malta: 470,
  Netherlands: 528,
  Poland: 616,
  Portugal: 620,
  Romania: 642,
  Slovakia: 703,
  Slovenia: 705,
  Spain: 724,
  Sweden: 752,
};

//for the space time vis
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
// const PROJ_CENTER = [7.75, 48.5]; //pan the map left/right/up/down
const PROJ_CENTER = [7.3, 48.5];
const PROJ_SCALE_K = 1.65; // scale = width * PROJ_SCALE_K, zoom — bigger = more zoomed in
const PROJ_TX_K = 0.5; // translateX = width * PROJ_TX_K, horizontal crop - shifts the whole map left/right
const PROJ_TY_K = 1 / 2.7; // translateY = height * PROJ_TY_K, vertical crop - shifts the whole map up/down

//for choropleth
const PROJ_CENTER2 = [7.75, 48.5]; //pan the map left/right/up/down
const PROJ_SCALE_K2 = 1.4; // scale = width * PROJ_SCALE_K, zoom — bigger = more zoomed in
const PROJ_TX_K2 = 0.45; // translateX = width * PROJ_TX_K, horizontal crop - shifts the whole map left/right
const PROJ_TY_K2 = 1 / 2.7; // translateY = height * PROJ_TY_K, vertical crop - shifts the whole map up/down

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

async function loadUnemploymentChoropleth() {
  const res = await fetch("/data/unemployment.csv");
  const text = await res.text();
  const rows = text.trim().split(/\r?\n/).slice(1);
  return rows.map((line) => {
    const parts = line.split(",");
    const country = parts[1].trim();
    const year = +parts[2].trim();
    const rate = parts[3] ? +parts[3].trim() : null;
    return { country, year, rate };
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

//chloropleth
// window 3 (choropleth)

function buildChoroplethSpec(
  topoData,
  unemploymentData,
  year,
  w,
  h,
  selectionMode = false,
  selectedIds = []
) {
  const rateByCountryName = {};
  unemploymentData
    .filter((d) => d.year === year)
    .forEach((d) => {
      rateByCountryName[d.country] = d.rate;
    });

  const rateValues = Object.entries(EU_COUNTRY_IDS).map(([name, id]) => ({
    id: String(id),
    rate: rateByCountryName[name] ?? null,
  }));

  const selectedTest =
    selectedIds.length > 0
      ? selectedIds.map((id) => `datum.id === '${id}'`).join(" || ")
      : "false";

  return {
    $schema: "https://vega.github.io/schema/vega/v5.json",
    width: w,
    height: h,
    autosize: "none",
    background: "#dce8f0",

    signals: [{ name: "selectedYear", value: year }],

    data: [
      {
        name: "countries",
        values: topoData,
        format: { type: "topojson", feature: "countries" },
      },
      {
        name: "rates",
        values: rateValues,
      },
      {
        name: "joined",
        source: "countries",
        transform: [
          {
            type: "lookup",
            from: "rates",
            key: "id",
            fields: ["id"],
            values: ["rate"],
            as: ["rate"],
          },
        ],
      },
    ],

    projections: [
      {
        name: "proj",
        type: "mercator",
        center: PROJ_CENTER2,
        scale: w * PROJ_SCALE_K2,
        translate: [w * PROJ_TX_K2, h * PROJ_TY_K2],
      },
    ],

    scales: [
      {
        name: "color",
        type: "sequential",
        domain: [0, 30],
        range: { scheme: "orangered" },
        zero: true,
      },
    ],

    legends: selectionMode
      ? []
      : [
          {
            fill: "color",
            orient: "bottom-right",
            title: "Unemployment Rate (%)",
            direction: "horizontal",
            // titleFontSize: 11,
            // labelFontSize: 10,
            // gradientLength: 120,
            // gradientThickness: 12,
            titleFontSize: 15,
            titleLimit: 500,
            labelFontSize: 15,
            gradientLength: 250,
            gradientThickness: 20,
          },
        ],

    marks: [
      {
        type: "shape",
        from: { data: "countries" },
        transform: [{ type: "geoshape", projection: "proj" }],
        encode: {
          enter: {
            fill: { value: "#b0bec5" },
            stroke: { value: "#ffffff" },
            strokeWidth: { value: 0.5 },
          },
        },
      },
      {
        name: "choropleth",
        type: "shape",
        from: { data: "joined" },
        transform: [{ type: "geoshape", projection: "proj" }],
        encode: {
          update: {
            // fill: [
            //   { test: "datum.rate == null", value: "#b0bec5" },
            //   { scale: "color", field: "rate" },
            // ],
            // stroke: { value: "#ffffff" },
            // strokeWidth: { value: 0.6 },
            // tooltip: {
            //   signal:
            //     "datum.rate != null ? {'Country': datum.properties.name, 'Year': selectedYear, 'Unemployment': format(datum.rate, '.1f') + '%'} : {'Country': datum.properties.name, 'Note': 'No data'}",
            // },
            fill: selectionMode
              ? [
                  { test: selectedTest, value: "#a9d3ff" }, // selected = blue
                  { value: "#4a5a6a" }, // unselected = dark gray
                ]
              : [
                  { test: "datum.rate == null", value: "#b0bec5" },
                  { scale: "color", field: "rate" },
                ],
            stroke: { value: selectionMode ? "#000000" : "#ffffff" },
            strokeWidth: { value: selectionMode ? 0.7 : 0.6 },
            cursor: { value: "pointer" },
          },
        },
      },
    ],
  };
}

async function initChoropleth() {
  const [topoData, unemploymentData] = await Promise.all([
    loadTopoJSON(),
    loadUnemploymentChoropleth(),
  ]);

  const containerEl = document.getElementById("win3");
  const sliderEl = document.getElementById("year-slider");
  const yearDisplayEl = document.getElementById("year-display");
  const mapWrap = document.getElementById("map-wrap");
  const ch = new BroadcastChannel(CHANNEL_NAME);
  let embedResult = null;
  let currentYear = 1994;
  let selectedCountries = [];
  let selectionMode = false;

  function getSizeChoro() {
    const headerHeight = document.getElementById("header").offsetHeight;
    const sliderHeight = document.getElementById("slider-wrap").offsetHeight;
    return {
      w: window.innerWidth,
      h: window.innerHeight - headerHeight - sliderHeight,
    };
  }

  function getSelectedIds() {
    return selectedCountries
      .map((name) => EU_COUNTRY_IDS[name])
      .filter(Boolean)
      .map(String);
  }

  async function renderChoropleth() {
    const { w, h } = getSizeChoro();

    const spec = buildChoroplethSpec(
      topoData,
      unemploymentData,
      currentYear,
      w,
      h,
      selectionMode,
      getSelectedIds()
    );
    if (embedResult) embedResult.view.finalize();

    // if (embedResult) {
    //   embedResult.view.finalize();
    // }

    // containerEl.style.transform = "";
    // containerEl.style.transformOrigin = "";

    embedResult = await vegaEmbed(containerEl, spec, {
      renderer: "canvas",
      actions: false,
    });
    // click to select — only COUNTRIES (wall countries) are selectable
    embedResult.view.addEventListener("click", (_event, item) => {
      if (!item || item.mark.name !== "choropleth") return;
      const clickedId = item.datum.id;
      const name = Object.entries(EU_COUNTRY_IDS).find(
        ([, id]) => String(id) === String(clickedId)
      )?.[0];
      if (!name || !COUNTRIES.includes(name)) return;

      const alreadySelected = selectedCountries.includes(name);
      selectedCountries = alreadySelected
        ? selectedCountries.filter((c) => c !== name)
        : [...selectedCountries, name];

      selectionMode = selectedCountries.length > 0;
      ch.postMessage({ type: "select", selectedCountries });
      renderChoropleth();
    });
  }

  // listen for selection changes from wall/map windows
  ch.onmessage = (e) => {
    if (e.data.type === "select") {
      selectedCountries = e.data.selectedCountries || [];
      selectionMode = selectedCountries.length > 0;
      renderChoropleth();
    }
  };

  sliderEl.addEventListener("input", () => {
    currentYear = +sliderEl.value;
    yearDisplayEl.textContent = currentYear;
    renderChoropleth();
  });

  await renderChoropleth();

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderChoropleth(), 200);
  });
}

function buildLineChartSpec(unemploymentData, containerWidth, containerHeight) {
  const chartData = unemploymentData
    .filter(
      (d) =>
        EU_LINE_CHART_COUNTRIES.includes(d.country) &&
        d.year >= 1994 &&
        d.year <= 2024
    )
    .map((d) => ({
      country: String(d.country),
      year: Number(d.year),
      rate: Number(d.rate),
    }));

  return {
    $schema: "https://vega.github.io/schema/vega/v5.json",
    width: (containerWidth || 900) - 32 - 55 - 150,
    height: (containerHeight || 500) - 20 - 40,
    // padding: { left: 55, right: 150, top: 20, bottom: 40 },
    padding: { left: 75, right: 150, top: 20, bottom: 40 },
    autosize: "none",
    background: "#ffffff",

    data: [
      {
        name: "chartData",
        values: chartData,
      },
    ],

    scales: [
      {
        name: "x",
        type: "point",
        domain: [
          1994, 1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004,
          2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015,
          2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024,
        ],
        range: "width",
      },
      // {
      //   name: "x",
      //   type: "point",
      //   domain: [1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022, 2024],
      //   range: "width",
      // },
      {
        name: "y",
        type: "linear",
        domain: [0, 30],
        range: "height",
        nice: true,
      },
      {
        name: "color",
        type: "ordinal",
        domain: EU_LINE_CHART_COUNTRIES,
        range: { scheme: "tableau20" },
      },
    ],

    axes: [
      {
        orient: "bottom",
        scale: "x",
        values: [1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022, 2024],
        // labelAngle: -45,
        labelAlign: "right",
        // labelFontSize: 12,
        labelFontSize: 20,
      },
      {
        orient: "left",
        scale: "y",
        tickCount: 7,
        grid: true,
        // gridColor: "#e0e0e0",
        gridColor: "#A9A9A9",
        // labelFontSize: 12,
        labelFontSize: 20,
        title: "Unemployment Rate (%)",
        // titleFontSize: 14,
        titleFontSize: 24,
        titlePadding: 10,
      },
    ],

    legends: [
      {
        fill: "color",
        stroke: "color",
        orient: "right",
        title: null,
        // labelFontSize: 13,
        labelFontSize: 20,
        symbolType: "stroke",
        // symbolStrokeWidth: 2,
        symbolStrokeWidth: 20,
      },
    ],

    marks: [
      {
        type: "group",
        from: {
          facet: {
            name: "byCountry",
            data: "chartData",
            groupby: "country",
          },
        },
        marks: [
          {
            type: "line",
            from: { data: "byCountry" },
            encode: {
              enter: {
                x: { scale: "x", field: "year" },
                y: { scale: "y", field: "rate" },
                stroke: { scale: "color", field: "country" },
                // strokeWidth: { value: 1.5 },
                strokeWidth: { value: 3.5 },
                strokeOpacity: { value: 0.85 },
                tooltip: {
                  signal:
                    "{'Country': datum.country, 'Year': datum.year, 'Rate': format(datum.rate, '.1f') + '%'}",
                },
              },
            },
          },
        ],
      },
    ],
  };
}

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
// const WALL_PADDING_LEFT = 0;
const WALL_PADDING_LEFT = 30;
const WALL_PADDING_RIGHT = 30;

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
          // fontSize: { value: Math.min(17, colW / 6) },
          fontSize: { value: Math.min(20, colW)},

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

    data: [{ name: "bricks", values: bricks }],

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
async function initWall() {
  const unemploymentData = await loadUnemployment();

  const ch = new BroadcastChannel(CHANNEL_NAME);
  const win2El = document.getElementById("win2");
  const titleEl = document.getElementById("win2-title");

  let embedResult = null;
  let selectedCountries = [];
  let mode = "linechart"; // default state

  function getWallSize() {
    const titleHeight = 70;
    return {
      w: window.innerWidth || 900,
      h: (window.innerHeight || 400) - titleHeight,
    };
  }

  function updateTitle() {
    if (!titleEl) return;
    titleEl.textContent =
      mode === "linechart"
        ? "EU Unemployment Rate 1994–2024"
        : "Great Wall of Space–Time  ·  Unemployment Rate 1994–2024";
  }

  async function render() {
    const { w, h } = getWallSize();
    const spec =
      mode === "linechart"
        ? buildLineChartSpec(unemploymentData, w, h)
        : buildWallSpec(
            computeXCoords(w, h),
            unemploymentData,
            selectedCountries,
            h,
            w
          );

    if (embedResult) embedResult.view.finalize();
    embedResult = await vegaEmbed(win2El, spec, {
      renderer: "canvas",
      actions: false,
    });

    embedResult.view.addEventListener("click", (_event, item) => {
      if (!item || item.mark.type !== "rect") return;
      const country = item.datum.country;
      if (!country) return;
      const alreadySelected = selectedCountries.includes(country);
      selectedCountries = alreadySelected
        ? selectedCountries.filter((ctry) => ctry !== country)
        : [...selectedCountries, country];
      ch.postMessage({ type: "select", selectedCountries });
      render();
    });

    updateTitle();
  }

  ch.onmessage = (e) => {
    if (e.data.type === "select") {
      selectedCountries = e.data.selectedCountries || [];
      mode = selectedCountries.length > 0 ? "wall" : "linechart";
      render();
    }
  };

  await render();

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => render(), 200);
  });
}

const windowType = document.body.dataset.window;
if (windowType === "map") initMap();
else if (windowType === "wall") initWall();
else if (windowType === "choropleth") initChoropleth();
