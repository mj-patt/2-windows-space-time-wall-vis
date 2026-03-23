# 2-windows-space-time-wall-vis


# Great Wall of Space–Time
### Unemployment Rate Visualization (1994–2024)

An interactive two-window visualization inspired by Tominski's *Great Wall of Space-Time* technique. It displays unemployment rates across 5 Western/Central European countries **Portugal, Spain, France, Germany, and Poland** over time, using a geographic route on a map and a color-coded brick wall.

Window 1 (Map) — A Mercator map of Western/Central Europe showing a route from Portugal (west) to Poland (east), passing through each country in order. Clicking a node or country on the map filters the wall to show data up to that point along the route.

Window 2 (Wall) — A "wall" of color-coded bricks where each column represents a country and each brick represents a sampled year (1994, 2000, 2006, 2012, 2018, 2024). Color encodes unemployment rate on a sequential orange-red scale. The column widths are proportional to the geographic distances between route points on the map.

How to load each window:
- `http://localhost../window1-map.html`
- `http://localhost../window2-wall.html`

**Important:** The wall's column widths are computed from the map's projected pixel coordinates. Both windows must be sized before loading the pages, and should be kept at the same width to ensure the route markers on the wall align correctly with the map.

**Interaction**
- Clicking on nodes, paths or countries -> Shows data from Portugal up to that country 
- Hovering on data bricks -> Shows tooltip (country name, year, unemployment rate)
