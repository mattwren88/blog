const scroller = document.querySelector("#timelineScroller");
const stops = Array.from(document.querySelectorAll(".stop"));
const mapLabel = document.querySelector("#mapLabel");
const mapDistance = document.querySelector("#mapDistance");

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const stopData = stops.map((stop) => ({
  el: stop,
  title: stop.dataset.title,
  progress: parseFloat(stop.dataset.progress),
  distance: stop.dataset.distance || "",
  latlng: L.latLng(parseFloat(stop.dataset.lat), parseFloat(stop.dataset.lng)),
}));

const routeLatLngs = stopData.map((stop) => stop.latlng);

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
  maxZoom: 7,
  minZoom: 3,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const baseRoute = L.polyline(routeLatLngs, {
  color: "#a5907e",
  weight: 4,
  dashArray: "4 16",
  opacity: 0.7,
}).addTo(map);

const progressRoute = L.polyline([routeLatLngs[0]], {
  color: "#d9713d",
  weight: 5,
  opacity: 0.9,
}).addTo(map);

const stopMarkers = stopData.map((stop) =>
  L.circleMarker(stop.latlng, {
    radius: 6,
    color: "#b45124",
    weight: 2,
    fillColor: "#f6efe6",
    fillOpacity: 0.6,
  }).addTo(map)
);

const travelerIcon = L.divIcon({
  className: "traveler-icon",
  html: '<div class="traveler-arrow"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const travelerMarker = L.marker(routeLatLngs[0], {
  icon: travelerIcon,
  interactive: false,
}).addTo(map);

const segmentLengths = [];
let totalLength = 0;
for (let i = 0; i < routeLatLngs.length - 1; i += 1) {
  const length = routeLatLngs[i].distanceTo(routeLatLngs[i + 1]);
  segmentLengths.push(length);
  totalLength += length;
}

let ticking = false;
let activeIndex = 0;
let lastCenterProgress = -1;

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
  const target = totalLength * progress;
  let traveled = 0;

  for (let i = 0; i < segmentLengths.length; i += 1) {
    const length = segmentLengths[i];
    const start = routeLatLngs[i];
    const end = routeLatLngs[i + 1];

    if (target <= traveled + length) {
      const t = length ? (target - traveled) / length : 0;
      const lat = start.lat + (end.lat - start.lat) * t;
      const lng = start.lng + (end.lng - start.lng) * t;
      const angle = Math.atan2(end.lat - start.lat, end.lng - start.lng) * (180 / Math.PI);
      return { latlng: L.latLng(lat, lng), angle };
    }

    traveled += length;
  }

  const lastIndex = routeLatLngs.length - 1;
  const prev = routeLatLngs[lastIndex - 1];
  const last = routeLatLngs[lastIndex];
  const angle = Math.atan2(last.lat - prev.lat, last.lng - prev.lng) * (180 / Math.PI);
  return { latlng: last, angle };
};

const buildProgressCoords = (progress) => {
  const target = totalLength * progress;
  const coords = [routeLatLngs[0]];
  let traveled = 0;

  for (let i = 0; i < segmentLengths.length; i += 1) {
    const length = segmentLengths[i];
    const start = routeLatLngs[i];
    const end = routeLatLngs[i + 1];

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
  mapDistance.textContent = stopData[activeIndex].distance;
};

const updateMap = () => {
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

map.fitBounds(baseRoute.getBounds(), { padding: [48, 48] });
setTimeout(() => map.invalidateSize(), 0);

window.addEventListener("resize", () => {
  map.invalidateSize();
  requestUpdate();
});

scroller.addEventListener("scroll", requestUpdate, { passive: true });
window.addEventListener("scroll", requestUpdate, { passive: true });

updateMap();
