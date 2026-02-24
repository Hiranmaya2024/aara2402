const HQ_LAT = 20.9964;
const HQ_LNG = 83.0526;

const csvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ3bMMFf71-vdGNiWFnf7pD9XuAAUSA7J-g08ocyC2LNiVOTUHi56lB-7bKTKj0KK9nJGs9vU0THQ0E/pub?gid=1044390124&single=true&output=csv";

const tourPlan = {
  Monday: ["Juria"],
  Tuesday: ["Ghess"],
  Wednesday: ["Gaisilate"],
  Thursday: ["Dava"],
  Friday: ["Padampur"],
  Saturday: ["Paikmal", "Mandosil"]
};

let customers = [];
let todayRoute = [];
let selected = {};

const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
const todayAreas = tourPlan[today] || [];

/**
 * Sanitizes HTML content to prevent XSS attacks
 * @param {string} text - The text to sanitize
 * @returns {string} - Sanitized text
 */
function sanitizeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Parses CSV text into a 2D array
 * @param {string} text - CSV formatted text
 * @returns {Array} - 2D array of parsed data
 */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let value = "";
  let insideQuotes = false;

  for (let char of text) {
    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }
    if (char === "," && !insideQuotes) {
      row.push(value);
      value = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (value || row.length) {
        row.push(value);
        rows.push(row);
      }
      row = [];
      value = "";
      continue;
    }
    value += char;
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

/**
 * Fetches and processes customer data from Google Sheets
 */
async function fetchCustomerData() {
  try {
    showLoader(true);
    const response = await fetch(csvUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const text = await response.text();
    const rows = parseCSV(text).slice(1).filter(r => r[0]);

    customers = rows.map(r => ({
      name: sanitizeHTML(r[0]),
      area: sanitizeHTML(r[1]),
      status: sanitizeHTML(r[2]),
      reason: sanitizeHTML(r[3]),
      reactivate: r[4],
      business: r[5],
      avgcreditcycle: r[8],
      due: parseFloat(r[6]) || 0,
      phone: sanitizeHTML(r[13]),
      lat: parseFloat(r[14]),
      lng: parseFloat(r[15]),
      lastSale: sanitizeHTML(r[17]),
      lastCollection: sanitizeHTML(r[19]),
      saleAmt: r[18],
      collectionAmt: r[20],
      OrdersDisMonth: r[21],
      route: sanitizeHTML(r[22])
    }));

    todayRoute = customers.filter(c => todayAreas.includes(c.area));
    customers.sort((a, b) => getRecoveryScore(b) - getRecoveryScore(a));

    renderAll();
    showLoader(false);
  } catch (error) {
    console.error('Error fetching customer data:', error);
    showError('Failed to load customer data. Please try again later.');
    showLoader(false);
  }
}

/**
 * Calculates recovery priority score for a customer
 * @param {Object} customer - Customer object
 * @returns {number} - Recovery score
 */
function getRecoveryScore(customer) {
  if (!customer.lastSale) return 0;
  
  const creditDays = Math.floor((new Date() - new Date(customer.lastSale)) / 86400000);
  let score = 0;

  if (customer.status.toLowerCase().includes("blocked")) score += 1000;
  if (creditDays > 90) score += 500;
  else if (creditDays > 60) score += 300;
  
  score += customer.due / 1000;
  
  return score;
}

/**
 * Calculates distance between two coordinates using Haversine formula
 * @param {number} lat1 - First latitude
 * @param {number} lng1 - First longitude
 * @param {number} lat2 - Second latitude
 * @param {number} lng2 - Second longitude
 * @returns {number} - Distance in kilometers
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculates total route distance
 * @returns {number} - Total distance in kilometers
 */
function calculateTotalRoute() {
  let total = 0;
  let prevLat = HQ_LAT;
  let prevLng = HQ_LNG;

  todayRoute.forEach(location => {
    if (location.lat && location.lng) {
      total += calculateDistance(prevLat, prevLng, location.lat, location.lng);
      prevLat = location.lat;
      prevLng = location.lng;
    }
  });

  total += calculateDistance(prevLat, prevLng, HQ_LAT, HQ_LNG);
  return total;
}

/**
 * Renders all dashboard content
 */
function renderAll() {
  renderRouteBox();
  renderCustomerGrid();
}

/**
 * Renders the daily route information
 */
function renderRouteBox() {
  const totalDist = calculateTotalRoute();
  const travelTime = (totalDist / 25).toFixed(1);
  const routeBox = document.getElementById('routeBox');

  if (!routeBox) return;

  routeBox.innerHTML = `
    <div class="route-left">
      <b>🗓 Today's Route – ${sanitizeHTML(todayAreas.join(", "))}</b>
      <p>✔ Parties: ${todayRoute.length}</p>
      <p>✔ Round-trip: ${totalDist.toFixed(1)} km</p>
      <p>✔ Travel time: ${travelTime} hrs</p>
      <button class="action-btn btn-tour" onclick="startTour()" aria-label="Start navigation tour">
        🧭 Start Tour
      </button>
    </div>

    <div class="party-list" role="list">
      ${todayRoute.map((customer, index) => `
        <div class="party-item" onclick="openProfileByName('${customer.name}')" role="listitem" tabindex="0" 
             onkeypress="if(event.key==='Enter') openProfileByName('${customer.name}')">
          ${index + 1}. ${customer.name}<br>
          📍 ${calculateDistance(HQ_LAT, HQ_LNG, customer.lat, customer.lng).toFixed(1)} km
        </div>
      `).join("")}
    </div>
  `;
}

/**
 * Renders the customer grid
 */
function renderCustomerGrid() {
  const customerGrid = document.getElementById('customerGrid');

  if (!customerGrid) return;

  customerGrid.innerHTML = "";

  customers.forEach(customer => {
    const creditDays = customer.lastSale 
      ? Math.floor((new Date() - new Date(customer.lastSale)) / 86400000)
      : 0;

    let tagHTML = "";
    let tagClass = "";

    if (customer.status.toLowerCase().includes("blocked")) {
      tagHTML = "🔴 BLOCKED";
      tagClass = "tag-blocked";
    } else if (customer.due > 0 && creditDays > 60) {
      tagHTML = "💰 COLLECT NOW";
      tagClass = "tag-collect";
    } else if (creditDays > 60) {
      tagHTML = "🟡 FOLLOW UP";
      tagClass = "tag-followup";
    }

    const distance = customer.lat && customer.lng
      ? calculateDistance(HQ_LAT, HQ_LNG, customer.lat, customer.lng).toFixed(1) + " km"
      : "—";

    const cardHTML = `
      <div class="customer-card" onclick="openProfileByName('${customer.name}')" 
           tabindex="0" onkeypress="if(event.key==='Enter') openProfileByName('${customer.name}')"
           role="button" aria-label="View ${customer.name} profile">
        <div class="customer-card-title">${customer.name}</div>
        <div class="customer-card-info">
          ${customer.area} | ₹${customer.due} | 📍 ${distance}
        </div>
        ${tagHTML ? `<div class="customer-card-tag ${tagClass}">${tagHTML}</div>` : ""}
      </div>
    `;

    customerGrid.innerHTML += cardHTML;
  });
}

/**
 * Opens customer profile by name
 * @param {string} name - Customer name
 */
function openProfileByName(name) {
  selected = customers.find(c => c.name === name);

  if (!selected) {
    showError('Customer not found');
    return;
  }

  const mainScreen = document.getElementById('mainScreen');
  const profileScreen = document.getElementById('profileScreen');

  if (!mainScreen || !profileScreen) return;

  mainScreen.classList.add('screen-hidden');
  profileScreen.classList.remove('screen-hidden');

  renderProfileScreen();
}

/**
 * Renders the customer profile screen
 */
function renderProfileScreen() {
  const profileScreen = document.getElementById('profileScreen');

  if (!profileScreen || !selected) return;

  profileScreen.innerHTML = `
    <div class="profile-wrapper">
      <div class="profile-header">
        <button class="back-btn" onclick="goBack()" aria-label="Go back to dashboard">⬅ Back</button>
        <span>Customer Profile</span>
      </div>

      <div class="profile-card">
        <h1 class="profile-title">
          ${selected.name}
          <span>📍 ${selected.area}</span>
          <span>📌 ${selected.route}</span>
        </h1>

        <div class="profile-info">
          <b>☎ Phone:</b>
          <a href="tel:${selected.phone}" aria-label="Call ${selected.name}">${selected.phone}</a>
        </div>

        <div class="profile-info">
          <b>💰 Total Business:</b> ₹${selected.business}
        </div>

        <div class="profile-info">
          <b>💥 Total Due:</b> ₹${selected.due}
          <b>⏰ Avg Payment Cycle:</b> ${selected.avgcreditcycle} Days
        </div>

        <div class="profile-info">
          <b>📅 Last Sale on:</b> ${selected.lastSale} 
          <b>💰 Amount:</b> ₹${selected.saleAmt}
        </div>

        <div class="profile-info">
          <b>📅 Last Payment on:</b> ${selected.lastCollection}
          <b>💰 Amount:</b> ₹${selected.collectionAmt}
        </div>

        <div class="profile-info">
          <b>🎯 No of Orders This Month:</b> ${selected.OrdersDisMonth}
        </div>

        <div class="profile-info">
          <b>🔰 Status:</b> ${selected.status}
        </div>

        <div class="profile-info">
          <b>💡 Reason:</b> ${selected.reason}
        </div>

        <div class="profile-info">
          <b>✅ Pay Now:</b> ₹${selected.reactivate}
        </div>

        <div class="action-row">
          <button class="action-btn btn-call" onclick="makeCall()" aria-label="Call customer">
            📞 Call
          </button>
          <button class="action-btn btn-whatsapp" onclick="sendWhatsApp()" aria-label="Send WhatsApp message">
            🟢 WhatsApp
          </button>
          <button class="action-btn btn-navigate" onclick="navigateToCustomer()" aria-label="Navigate to customer location">
            📍 Navigate
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Goes back to main dashboard
 */
function goBack() {
  const mainScreen = document.getElementById('mainScreen');
  const profileScreen = document.getElementById('profileScreen');

  if (!mainScreen || !profileScreen) return;

  profileScreen.classList.add('screen-hidden');
  mainScreen.classList.remove('screen-hidden');
}

/**
 * Initiates a phone call
 */
function makeCall() {
  if (selected && selected.phone) {
    window.location.href = "tel:" + selected.phone;
  }
}

/**
 * Opens WhatsApp chat
 */
function sendWhatsApp() {
  if (selected && selected.phone) {
    window.open(`https://wa.me/91${selected.phone}`, '_blank');
  }
}

/**
 * Navigates to customer location on Google Maps
 */
function navigateToCustomer() {
  if (selected && selected.lat && selected.lng) {
    window.open(`https://www.google.com/maps?q=${selected.lat},${selected.lng}`, '_blank');
  }
}

/**
 * Starts Google Maps tour with today's route
 */
function startTour() {
  if (todayRoute.length === 0) {
    showError('No customers scheduled for today');
    return;
  }

  const routePoints = todayRoute
    .filter(c => c.lat && c.lng)
    .map(c => `${c.lat},${c.lng}`)
    .join("/");

  if (routePoints) {
    const mapsUrl = `https://www.google.com/maps/dir/${HQ_LAT},${HQ_LNG}/${routePoints}/${HQ_LAT},${HQ_LNG}`;
    window.open(mapsUrl, '_blank');
  } else {
    showError('Cannot start tour: missing location data');
  }
}

/**
 * Shows or hides loader
 * @param {boolean} show - Whether to show the loader
 */
function showLoader(show) {
  let loader = document.getElementById('loader');
  
  if (show) {
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'loader';
      loader.className = 'loader';
      document.body.appendChild(loader);
    }
    loader.style.display = 'block';
  } else if (loader) {
    loader.style.display = 'none';
  }
}

/**
 * Shows error message
 * @param {string} message - Error message to display
 */
function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;
  errorDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #d32f2f;
    color: white;
    padding: 16px;
    border-radius: 8px;
    z-index: 1000;
    animation: slideInRight 0.3s ease-out;
  `;

  document.body.appendChild(errorDiv);

  setTimeout(() => {
    errorDiv.remove();
  }, 4000);
}

/**
 * Registers service worker for PWA support
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(err => {
      console.warn('Service worker registration failed:', err);
    });
  }
}

/**
 * Initialize the application on page load
 */
document.addEventListener('DOMContentLoaded', function() {
  fetchCustomerData();
  registerServiceWorker();
});
