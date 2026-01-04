const scroller = document.querySelector("#timelineScroller");
const stops = Array.from(document.querySelectorAll(".stop"));
const mapLabel = document.querySelector("#mapLabel");
const mapDistance = document.querySelector("#mapDistance");

const GPX_PATH = "data/BikeMS_City_to_Shore_25.gpx";
const MAX_ROUTE_POINTS = 2000;
const METERS_PER_MILE = 1609.344;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const stopData = stops.map((stop) => {
  const dateEl = stop.querySelector(".stop-date");
  const lat = parseFloat(stop.dataset.lat);
  const lng = parseFloat(stop.dataset.lng);
  const latlng = Number.isFinite(lat) && Number.isFinite(lng) ? L.latLng(lat, lng) : null;

  return {
    el: stop,
    dateEl,
    dayLabel: dateEl ? dateEl.textContent.trim() : "",
    title: stop.dataset.title,
    progress: parseFloat(stop.dataset.progress),
    distance: stop.dataset.distance || "",
    milesLabel: "",
    latlng,
  };
});

const getFallbackRoute = () =>
  stopData.map((stop) => stop.latlng).filter((latlng) => latlng);

const map = L.map("map", {
  zoomControl: false,
  attributionControl: false,
  dragging: false,
  scrollWheelZoom: false,
  doubleClickZoom: false,
  boxZoom: false,
  keyboard: false,
  tap: false,
});

L.control.attribution({ position: "bottomleft" }).addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 15,
  minZoom: 3,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const fallbackRoute = getFallbackRoute();
const initialRoute = fallbackRoute.length > 1 ? fallbackRoute : [L.latLng(0, 0), L.latLng(0.1, 0.1)];

const baseRoute = L.polyline(initialRoute, {
  color: "#a5907e",
  weight: 4,
  dashArray: "4 16",
  opacity: 0.7,
}).addTo(map);

const progressRoute = L.polyline([initialRoute[0]], {
  color: "#d9713d",
  weight: 5,
  opacity: 0.9,
}).addTo(map);

const travelerIcon = L.divIcon({
  className: "traveler-icon",
  html: '<div class="traveler-arrow"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const travelerMarker = L.marker(initialRoute[0], {
  icon: travelerIcon,
  interactive: false,
}).addTo(map);

let stopMarkers = [];
let routeState = null;
let ticking = false;
let activeIndex = 0;
let lastCenterProgress = -1;

const buildRouteState = (latlngs) => {
  const segmentLengths = [];
  let totalLength = 0;

  for (let i = 0; i < latlngs.length - 1; i += 1) {
    const length = latlngs[i].distanceTo(latlngs[i + 1]);
    segmentLengths.push(length);
    totalLength += length;
  }

  return { latlngs, segmentLengths, totalLength };
};

const formatMiles = (miles) => {
  const rounded = Math.round(miles * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
};

const updateStopMileage = (totalMiles) => {
  stopData.forEach((stop) => {
    const miles = totalMiles * stop.progress;
    const label = `${stop.dayLabel || "Day"} | ${formatMiles(miles)} mi`;
    stop.milesLabel = `${formatMiles(miles)} mi`;
    if (stop.dateEl) {
      stop.dateEl.textContent = label;
    }
  });
};

const getScrollState = () => {
  const maxScroll = scroller.scrollHeight - scroller.clientHeight;
  if (maxScroll > 4) {
    return { scrollTop: scroller.scrollTop, maxScroll };
  }

  const doc = document.documentElement;
  const pageMax = doc.scrollHeight - window.innerHeight;
  return { scrollTop: window.scrollY || doc.scrollTop, maxScroll: pageMax };
};

const getPositionForProgress = (progress) => {
  const { latlngs, segmentLengths, totalLength } = routeState;
  const target = totalLength * progress;
  let traveled = 0;

  for (let i = 0; i < segmentLengths.length; i += 1) {
    const length = segmentLengths[i];
    const start = latlngs[i];
    const end = latlngs[i + 1];

    if (target <= traveled + length) {
      const t = length ? (target - traveled) / length : 0;
      const lat = start.lat + (end.lat - start.lat) * t;
      const lng = start.lng + (end.lng - start.lng) * t;
      const angle = Math.atan2(end.lat - start.lat, end.lng - start.lng) * (180 / Math.PI);
      return { latlng: L.latLng(lat, lng), angle };
    }

    traveled += length;
  }

  const lastIndex = latlngs.length - 1;
  const prev = latlngs[lastIndex - 1];
  const last = latlngs[lastIndex];
  const angle = Math.atan2(last.lat - prev.lat, last.lng - prev.lng) * (180 / Math.PI);
  return { latlng: last, angle };
};

const buildProgressCoords = (progress) => {
  const { latlngs, segmentLengths, totalLength } = routeState;
  const target = totalLength * progress;
  const coords = [latlngs[0]];
  let traveled = 0;

  for (let i = 0; i < segmentLengths.length; i += 1) {
    const length = segmentLengths[i];
    const start = latlngs[i];
    const end = latlngs[i + 1];

    if (target > traveled + length) {
      coords.push(end);
      traveled += length;
    } else {
      const t = length ? (target - traveled) / length : 0;
      const lat = start.lat + (end.lat - start.lat) * t;
      const lng = start.lng + (end.lng - start.lng) * t;
      coords.push(L.latLng(lat, lng));
      break;
    }
  }

  return coords;
};

const updateStopsFromRoute = () => {
  stopData.forEach((stop) => {
    stop.latlng = getPositionForProgress(stop.progress).latlng;
  });
};

const syncStopMarkers = () => {
  if (!stopMarkers.length) {
    stopMarkers = stopData.map((stop) =>
      L.circleMarker(stop.latlng, {
        radius: 6,
        color: "#b45124",
        weight: 2,
        fillColor: "#f6efe6",
        fillOpacity: 0.6,
      }).addTo(map)
    );
    return;
  }

  stopMarkers.forEach((marker, index) => {
    marker.setLatLng(stopData[index].latlng);
  });
};

const updateActiveStop = (progress) => {
  let nextActive = 0;
  stopData.forEach((stop, index) => {
    if (progress + 0.03 >= stop.progress) {
      nextActive = index;
    }
  });

  if (nextActive !== activeIndex) {
    activeIndex = nextActive;
  }

  stopData.forEach((stop, index) => {
    stop.el.classList.toggle("active", index === activeIndex);
  });

  stopMarkers.forEach((marker, index) => {
    marker.setStyle({
      radius: index === activeIndex ? 8 : 6,
      fillOpacity: index === activeIndex ? 1 : 0.6,
    });
  });

  mapLabel.textContent = stopData[activeIndex].title;
  mapDistance.textContent =
    stopData[activeIndex].milesLabel || stopData[activeIndex].distance;
};

const updateMap = () => {
  if (!routeState) {
    ticking = false;
    return;
  }

  const { scrollTop, maxScroll } = getScrollState();
  const rawProgress = maxScroll ? scrollTop / maxScroll : 0;
  const progress = clamp(rawProgress, 0, 1);

  const progressCoords = buildProgressCoords(progress);
  progressRoute.setLatLngs(progressCoords);

  const position = getPositionForProgress(progress);
  travelerMarker.setLatLng(position.latlng);

  const arrow = travelerMarker.getElement()?.querySelector(".traveler-arrow");
  if (arrow) {
    arrow.style.transform = `rotate(${position.angle}deg)`;
  }

  if (Math.abs(progress - lastCenterProgress) > 0.002) {
    map.panTo(position.latlng, { animate: false });
    lastCenterProgress = progress;
  }

  updateActiveStop(progress);
  ticking = false;
};

const requestUpdate = () => {
  if (!ticking) {
    window.requestAnimationFrame(updateMap);
    ticking = true;
  }
};

const decimateLatLngs = (latlngs) => {
  if (latlngs.length <= MAX_ROUTE_POINTS) {
    return latlngs;
  }

  const step = Math.ceil(latlngs.length / MAX_ROUTE_POINTS);
  const trimmed = [];

  for (let i = 0; i < latlngs.length; i += step) {
    trimmed.push(latlngs[i]);
  }

  const last = latlngs[latlngs.length - 1];
  if (trimmed[trimmed.length - 1] !== last) {
    trimmed.push(last);
  }

  return trimmed;
};

const parseGpxText = (text) => {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "text/xml");
  const trackPoints = Array.from(xml.getElementsByTagName("trkpt"));
  const routePoints = Array.from(xml.getElementsByTagName("rtept"));
  const points = trackPoints.length ? trackPoints : routePoints;

  const latlngs = points
    .map((point) => {
      const lat = parseFloat(point.getAttribute("lat"));
      const lng = parseFloat(point.getAttribute("lon"));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }
      return L.latLng(lat, lng);
    })
    .filter((point) => point);

  return decimateLatLngs(latlngs);
};

const applyRoute = (latlngs) => {
  if (!latlngs || latlngs.length < 2) {
    return;
  }

  routeState = buildRouteState(latlngs);
  baseRoute.setLatLngs(latlngs);
  progressRoute.setLatLngs([latlngs[0]]);
  travelerMarker.setLatLng(latlngs[0]);

  updateStopsFromRoute();
  syncStopMarkers();
  updateStopMileage(routeState.totalLength / METERS_PER_MILE);

  map.fitBounds(baseRoute.getBounds(), { padding: [48, 48] });
  setTimeout(() => map.invalidateSize(), 0);
  updateMap();
};

const loadRouteFromGpx = async () => {
  try {
    const response = await fetch(GPX_PATH);
    if (!response.ok) {
      return null;
    }
    const text = await response.text();
    const latlngs = parseGpxText(text);
    return latlngs.length ? latlngs : null;
  } catch (error) {
    return null;
  }
};

const initRoute = async () => {
  const gpxRoute = await loadRouteFromGpx();
  if (gpxRoute) {
    applyRoute(gpxRoute);
    return;
  }

  applyRoute(fallbackRoute);
};

window.addEventListener("resize", () => {
  map.invalidateSize();
  requestUpdate();
});

scroller.addEventListener("scroll", requestUpdate, { passive: true });
window.addEventListener("scroll", requestUpdate, { passive: true });

initRoute();
