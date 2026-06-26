const DEFAULTS = {
  monthlyRent: 1200,
  revenueInput: 3500,
  setupCost: 6500,
  securityDeposit: 1200,
  agencyFees: 800,
  cleaningCost: 180,
  utilities: 180,
};
const SUPABASE_URL = "https://xextjgbcageyajtbulra.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_31I3Gv9V5aBGSA-tsWT3uA_9DA5CK1A";

const STORAGE_KEY = "airbnb-simulator-values";
const SEASONALITY_STORAGE_KEY = "airbnb-simulator-seasonality";
const REVENUE_MODE_STORAGE_KEY = "airbnb-simulator-revenue-mode";
const DEFAULT_SEASONALITY = "medium";
const DEFAULT_REVENUE_MODE = "monthly";
const IS_LOCAL_DEV =
  ["localhost", "127.0.0.1"].includes(window.location.hostname) ||
  window.location.protocol === "file:";
const MONTH_LABELS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Aoû",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];
const SEASONALITY_PROFILES = {
  high: {
    label: "Saisonnalité forte",
    distribution: [6, 5, 6, 7, 8, 11, 14, 14, 9, 8, 6, 6],
  },
  medium: {
    label: "Saisonnalité moyenne",
    distribution: [7, 7, 8, 8, 8, 10, 11, 11, 8, 8, 7, 7],
  },
  low: {
    label: "Saisonnalité faible",
    distribution: [7, 8, 8, 8, 9, 10, 10, 10, 8, 8, 7, 7],
  },
};

const ids = Object.keys(DEFAULTS);
const inputs = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const authShell = document.getElementById("authShell");
const appShell = document.getElementById("appShell");
const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authMessage = document.getElementById("authMessage");
const authSubmitButton = document.getElementById("authSubmitButton");
const logoutButton = document.getElementById("logoutButton");
const sessionEmail = document.getElementById("sessionEmail");
const revenueInput = document.getElementById("revenueInput");
const seasonalitySubtitle = document.getElementById("seasonalitySubtitle");
const legislationForm = document.getElementById("legislationForm");
const legislationCityInput = document.getElementById("legislationCityInput");
const legislationSubmitButton = document.getElementById("legislationSubmitButton");
const legislationFeedback = document.getElementById("legislationFeedback");
const legislationEmptyState = document.getElementById("legislationEmptyState");
const legislationLoadingState = document.getElementById("legislationLoadingState");
const legislationErrorState = document.getElementById("legislationErrorState");
const legislationResult = document.getElementById("legislationResult");
const legislationResultCity = document.getElementById("legislationResultCity");
const legislationResultMeta = document.getElementById("legislationResultMeta");
const legislationResultStatus = document.getElementById("legislationResultStatus");
const legislationSummary = document.getElementById("legislationSummary");
const legislationSignals = document.getElementById("legislationSignals");
const legislationKeyPoints = document.getElementById("legislationKeyPoints");
const legislationCaution = document.getElementById("legislationCaution");
const legislationSources = document.getElementById("legislationSources");
const legislationNearby = document.getElementById("legislationNearby");
const legislationNearbyIntro = document.getElementById("legislationNearbyIntro");
const legislationNearbyList = document.getElementById("legislationNearbyList");
let activeSeasonality = DEFAULT_SEASONALITY;
let activeRevenueMode = DEFAULT_REVENUE_MODE;
const legislationCache = new Map();
const legislationState = {
  isLoading: false,
  error: "",
  result: null,
};
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const currencyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

function formatCurrency(value) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatPercent(value) {
  return `${percentFormatter.format(Number.isFinite(value) ? value : 0)} %`;
}

function formatSignedCurrency(value) {
  if (!Number.isFinite(value) || value === 0) {
    return formatCurrency(0);
  }

  return `${value > 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`;
}

function formatDistance(distanceKm) {
  if (!Number.isFinite(distanceKm)) {
    return "";
  }

  return `${percentFormatter.format(distanceKm)} km`;
}

function setAuthMessage(message, variant = "") {
  authMessage.textContent = message;
  authMessage.className = `auth-message${variant ? ` is-${variant}` : ""}`;
}

function setAuthSubmitting(isSubmitting) {
  authSubmitButton.disabled = isSubmitting;
  authSubmitButton.textContent = isSubmitting ? "Envoi en cours..." : "Envoyer le lien magique";
}

function cleanAuthUrl() {
  const shouldCleanHash = window.location.hash.includes("access_token");
  const shouldCleanQuery =
    window.location.search.includes("code=") || window.location.search.includes("token_hash=");

  if (shouldCleanHash || shouldCleanQuery) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

function updateAuthView(session) {
  if (IS_LOCAL_DEV) {
    authShell.classList.add("is-hidden");
    appShell.classList.remove("app-shell--hidden");
    sessionEmail.textContent = "Mode local (sans connexion)";
    logoutButton.hidden = true;
    render();
    return;
  }

  const isAuthenticated = Boolean(session);

  authShell.classList.toggle("is-hidden", isAuthenticated);
  appShell.classList.toggle("app-shell--hidden", !isAuthenticated);
  logoutButton.hidden = !isAuthenticated;

  if (isAuthenticated) {
    cleanAuthUrl();
    sessionEmail.textContent = session.user.email || "Session active";
    render();
    return;
  }

  sessionEmail.textContent = "...";
  setAuthSubmitting(false);
  setAuthMessage("Renseigne ton email pour recevoir le lien de connexion.");
}

function readValues() {
  return ids.reduce((acc, id) => {
    const rawValue = Number.parseFloat(inputs[id].value);
    acc[id] = Number.isFinite(rawValue) ? rawValue : 0;
    return acc;
  }, {});
}

function saveValues(values) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
}

function saveSeasonality(profile) {
  localStorage.setItem(SEASONALITY_STORAGE_KEY, profile);
}

function saveRevenueMode(mode) {
  localStorage.setItem(REVENUE_MODE_STORAGE_KEY, mode);
}

function loadSavedValues() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    ids.forEach((id) => {
      if (parsed[id] !== undefined && inputs[id]) {
        inputs[id].value = parsed[id];
      }
    });
  } catch (error) {
    console.warn("Impossible de charger les valeurs sauvegardées.", error);
  }
}

function loadSavedSeasonality() {
  const raw = localStorage.getItem(SEASONALITY_STORAGE_KEY);
  if (raw && SEASONALITY_PROFILES[raw]) {
    activeSeasonality = raw;
  }
}

function loadSavedRevenueMode() {
  const raw = localStorage.getItem(REVENUE_MODE_STORAGE_KEY);
  if (raw === "monthly" || raw === "annual") {
    activeRevenueMode = raw;
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateRevenueModeButtons() {
  document.querySelectorAll(".revenue-mode-option").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.revenueMode === activeRevenueMode);
  });
}

function updateRevenueContext() {
  seasonalitySubtitle.textContent =
    activeRevenueMode === "annual"
      ? "Le revenu annuel est réparti mois par mois selon le profil choisi, puis on calcule le bénéfice après toutes les charges."
      : "Le revenu mensuel est annualisé puis réparti mois par mois selon le profil choisi, puis on calcule le bénéfice après toutes les charges.";

  revenueInput.step = activeRevenueMode === "annual" ? "500" : "50";
}

function setLegislationFeedback(message, variant = "") {
  legislationFeedback.textContent = message;
  legislationFeedback.className = `legislation-feedback${variant ? ` is-${variant}` : ""}`;
}

function setLegislationLoading(isLoading) {
  legislationState.isLoading = isLoading;
  legislationSubmitButton.disabled = isLoading;
  legislationSubmitButton.textContent = isLoading
    ? "Analyse en cours..."
    : "Analyser la législation";
}

function getLegislationStatusConfig(status) {
  switch (status) {
    case "blue":
      return {
        label: "Bleu",
        tone: "Très accessible",
        className: "legislation-chip--blue",
      };
    case "green":
      return {
        label: "Vert",
        tone: "Faisable",
        className: "legislation-chip--green",
      };
    case "yellow":
      return {
        label: "Jaune",
        tone: "À cadrer",
        className: "legislation-chip--yellow",
      };
    default:
      return {
        label: "Rouge",
        tone: "Très contraint",
        className: "legislation-chip--red",
      };
  }
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every((value) => Number.isFinite(value))) {
    return Number.NaN;
  }

  const earthRadiusKm = 6371;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function readCommuneCoordinates(item) {
  if (!item?.centre || !Array.isArray(item.centre.coordinates) || item.centre.coordinates.length < 2) {
    return {
      latitude: undefined,
      longitude: undefined,
    };
  }

  const [longitude, latitude] = item.centre.coordinates;

  return {
    latitude: Number.isFinite(latitude) ? latitude : undefined,
    longitude: Number.isFinite(longitude) ? longitude : undefined,
  };
}

function normalizeGeoCommune(item, fallbackContext = {}) {
  const coordinates = readCommuneCoordinates(item);

  return {
    name: item.nom || "",
    code: item.code || "",
    departmentCode: item.departement?.code || fallbackContext.departmentCode || "",
    departmentName: item.departement?.nom || fallbackContext.departmentName || "",
    regionCode: item.region?.code || fallbackContext.regionCode || "",
    regionName: item.region?.nom || fallbackContext.regionName || "",
    population: Number.isFinite(item.population) ? item.population : 0,
    postalCodes: Array.isArray(item.codesPostaux) ? item.codesPostaux : [],
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
  };
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("La requête de données publiques a échoué.");
  }

  return response.json();
}

async function searchFrenchCommune(query) {
  const params = new URLSearchParams({
    nom: query,
    boost: "population",
    limit: "5",
    fields: "nom,code,population,codesPostaux,centre,departement,region",
    format: "json",
    geometry: "centre",
  });

  const results = await fetchJson(`https://geo.api.gouv.fr/communes?${params.toString()}`);
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  return results
    .map((item) => normalizeGeoCommune(item))
    .find((item) => item.name && item.code && Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
}

async function fetchNearbyCommunes(targetCommune) {
  if (!targetCommune?.departmentCode || !Number.isFinite(targetCommune.latitude) || !Number.isFinite(targetCommune.longitude)) {
    return [];
  }

  const params = new URLSearchParams({
    fields: "nom,code,population,codesPostaux,centre",
    format: "json",
    geometry: "centre",
  });

  const results = await fetchJson(
    `https://geo.api.gouv.fr/departements/${targetCommune.departmentCode}/communes?${params.toString()}`,
  );

  if (!Array.isArray(results)) {
    return [];
  }

  return results
    .map((item) =>
      normalizeGeoCommune(item, {
        departmentCode: targetCommune.departmentCode,
        departmentName: targetCommune.departmentName,
        regionCode: targetCommune.regionCode,
        regionName: targetCommune.regionName,
      }),
    )
    .filter((item) => item.code && item.code !== targetCommune.code)
    .map((item) => ({
      ...item,
      distanceKm: getDistanceKm(
        targetCommune.latitude,
        targetCommune.longitude,
        item.latitude,
        item.longitude,
      ),
    }))
    .filter((item) => Number.isFinite(item.distanceKm) && item.distanceKm <= 35)
    .sort((left, right) => {
      if (left.distanceKm !== right.distanceKm) {
        return left.distanceKm - right.distanceKm;
      }

      return (right.population || 0) - (left.population || 0);
    })
    .slice(0, 18);
}

function mergeNearbySuggestions(suggestions, nearbyCommunes) {
  const nearbyMap = new Map(nearbyCommunes.map((item) => [item.code, item]));

  return (Array.isArray(suggestions) ? suggestions : [])
    .map((suggestion) => {
      const commune = nearbyMap.get(suggestion.communeCode);
      if (!commune) {
        return null;
      }

      return {
        ...commune,
        status: suggestion.status,
        reason: suggestion.reason,
      };
    })
    .filter(Boolean);
}

async function invokeLegislationAnalysis(targetCommune, nearbyCommunes) {
  const cacheKey = targetCommune.code;
  if (legislationCache.has(cacheKey)) {
    return legislationCache.get(cacheKey);
  }

  const { data, error } = await supabaseClient.functions.invoke("city-legislation", {
    body: {
      targetCommune,
      nearbyCommunes,
    },
  });

  if (error) {
    throw new Error("Impossible d'interroger le moteur législation pour le moment.");
  }

  legislationCache.set(cacheKey, data);
  return data;
}

function getFactSignalDefinitions(facts) {
  return [
    {
      key: "compensation",
      icon: "layers",
      label: "Compensation",
      value: facts.compensationRequired ? "Oui" : "Non",
      tone: facts.compensationRequired ? "negative" : "positive",
      hint: facts.compensationRequired
        ? "Le montage devient plus lourd et plus coûteux."
        : "Aucune compensation lourde identifiée.",
    },
    {
      key: "changeOfUse",
      icon: "document",
      label: "Changement d'usage",
      value: facts.changeOfUseRequired ? "À prévoir" : "Non détecté",
      tone: facts.changeOfUseRequired ? "warning" : "positive",
      hint: facts.changeOfUseRequired
        ? "Une démarche administrative locale semble nécessaire."
        : "Pas de changement d'usage clair dans les sources trouvées.",
    },
    {
      key: "quota",
      icon: "gauge",
      label: "Quota / plafond",
      value: facts.quotaOrCap ? "Présent" : "Aucun signal",
      tone: facts.quotaOrCap ? "negative" : "positive",
      hint: facts.quotaOrCap
        ? "Le volume de projets peut être limité localement."
        : "Pas de quota local clair repéré.",
    },
    {
      key: "feasibility",
      icon: "spark",
      label: "Faisabilité dédiée",
      value: getFeasibilityLabel(facts.dedicatedRentalFeasibility),
      tone: getFeasibilityTone(facts.dedicatedRentalFeasibility),
      hint: getFeasibilityHint(facts.dedicatedRentalFeasibility),
    },
    {
      key: "source",
      icon: "shield",
      label: "Base officielle",
      value: facts.officialLocalRuleFound ? "Oui" : "Partielle",
      tone: facts.officialLocalRuleFound ? "positive" : "warning",
      hint: facts.officialLocalRuleFound
        ? "Le verdict s'appuie sur au moins une source officielle exploitable."
        : "Le verdict reste plus prudent faute de source locale solide.",
    },
  ];
}

function getFeasibilityLabel(value) {
  switch (value) {
    case "clear":
      return "Claire";
    case "conditional":
      return "Conditionnelle";
    case "difficult":
      return "Difficile";
    case "blocked":
      return "Bloquée";
    default:
      return "À confirmer";
  }
}

function getFeasibilityTone(value) {
  switch (value) {
    case "clear":
      return "positive";
    case "conditional":
      return "warning";
    case "difficult":
    case "blocked":
      return "negative";
    default:
      return "neutral";
  }
}

function getFeasibilityHint(value) {
  switch (value) {
    case "clear":
      return "Le modèle paraît jouable sans barrière lourde identifiée.";
    case "conditional":
      return "Le projet semble faisable, mais avec quelques conditions à cadrer.";
    case "difficult":
      return "Le projet paraît lourd ou risqué pour une stratégie dédiée.";
    case "blocked":
      return "Le modèle semble très contraint dans cette commune.";
    default:
      return "Les sources trouvées imposent encore une validation locale.";
  }
}

function getSignalIcon(iconName) {
  switch (iconName) {
    case "layers":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4 4 8l8 4 8-4-8-4Zm-6.5 7.5L12 15l6.5-3.5M5.5 15 12 18.5 18.5 15" />
        </svg>
      `;
    case "document":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 3.5h6l4 4V20.5H8zM14 3.5v4h4M10.5 12h5M10.5 15.5h5" />
        </svg>
      `;
    case "gauge":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 16a7 7 0 1 1 14 0M12 16l3.5-3.5M8 18h8" />
        </svg>
      `;
    case "spark":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m12 3 1.9 4.6L18.5 9l-4.6 1.4L12 15l-1.9-4.6L5.5 9l4.6-1.4L12 3Z" />
        </svg>
      `;
    default:
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4.5 6.5 7v4.2c0 3.4 2.2 6.5 5.5 7.3 3.3-.8 5.5-3.9 5.5-7.3V7L12 4.5Zm0 4.2v4.6M12 16h.01" />
        </svg>
      `;
  }
}

function renderLegislation() {
  const hasResult = Boolean(legislationState.result);
  const hasError = Boolean(legislationState.error);

  legislationEmptyState.classList.toggle(
    "is-hidden",
    legislationState.isLoading || hasError || hasResult,
  );
  legislationLoadingState.classList.toggle("is-hidden", !legislationState.isLoading);
  legislationErrorState.classList.toggle("is-hidden", !hasError);
  legislationResult.classList.toggle("is-hidden", !hasResult);

  if (hasError) {
    legislationErrorState.textContent = legislationState.error;
    setLegislationFeedback(
      "Le moteur n'a pas pu finaliser l'analyse. Tu peux réessayer avec une autre commune ou relancer dans un instant.",
      "error",
    );
  } else if (!legislationState.isLoading && !hasResult) {
    setLegislationFeedback(
      "Recherche France uniquement. Résumé informatif à confirmer auprès de la mairie ou du service urbanisme.",
    );
  }

  if (!hasResult) {
    return;
  }

  const { target, nearbySuggestions } = legislationState.result;
  const statusConfig = getLegislationStatusConfig(target.status);

  legislationResultCity.textContent = target.cityName;
  legislationResultMeta.textContent = `${target.departmentName} · ${target.regionName}`;
  legislationResultStatus.textContent = `${statusConfig.label} · ${statusConfig.tone}`;
  legislationResultStatus.className = `legislation-chip ${statusConfig.className}`;
  legislationSummary.textContent = target.summary;
  legislationCaution.textContent = target.caution;

  legislationSignals.innerHTML = "";
  getFactSignalDefinitions(target.facts).forEach((signal) => {
    const article = document.createElement("article");
    article.className = `legislation-signal-card legislation-signal-card--${signal.tone}`;

    const icon = document.createElement("div");
    icon.className = "legislation-signal-icon";
    icon.innerHTML = getSignalIcon(signal.icon);

    const body = document.createElement("div");
    body.className = "legislation-signal-body";

    const label = document.createElement("span");
    label.className = "legislation-signal-label";
    label.textContent = signal.label;

    const value = document.createElement("strong");
    value.className = "legislation-signal-value";
    value.textContent = signal.value;

    const hint = document.createElement("p");
    hint.className = "legislation-signal-hint";
    hint.textContent = signal.hint;

    body.appendChild(label);
    body.appendChild(value);
    body.appendChild(hint);
    article.appendChild(icon);
    article.appendChild(body);
    legislationSignals.appendChild(article);
  });

  legislationKeyPoints.innerHTML = "";
  target.keyPoints.forEach((point) => {
    const item = document.createElement("li");
    item.textContent = point;
    legislationKeyPoints.appendChild(item);
  });

  legislationSources.innerHTML = "";
  if (target.sources.length > 0) {
    target.sources.forEach((source) => {
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.className = "legislation-source-link";
      link.textContent = source.title;
      legislationSources.appendChild(link);
    });
  } else {
    const fallback = document.createElement("span");
    fallback.className = "nearby-card-meta";
    fallback.textContent = "Sources officielles à revalider manuellement pour cette commune.";
    legislationSources.appendChild(fallback);
  }

  const showNearby = ["yellow", "red"].includes(target.status) && nearbySuggestions.length > 0;
  legislationNearby.classList.toggle("is-hidden", !showNearby);

  if (showNearby) {
    legislationNearbyIntro.textContent =
      target.status === "red"
        ? "Dans cette zone, le modèle paraît tendu. Voici des communes proches qui semblent offrir un cadre plus favorable ou plus simple à creuser."
        : "Le cadre semble jouable mais encadré. Voici des communes proches à comparer pour trouver un terrain plus fluide.";

    legislationNearbyList.innerHTML = "";
    nearbySuggestions.forEach((suggestion) => {
      const status = getLegislationStatusConfig(suggestion.status);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nearby-card";
      button.addEventListener("click", () => {
        legislationCityInput.value = suggestion.name;
        analyzeCityLegislation(suggestion);
      });

      const titleRow = document.createElement("div");
      titleRow.className = "nearby-card-head";

      const title = document.createElement("strong");
      title.textContent = suggestion.name;

      const chip = document.createElement("span");
      chip.className = `legislation-chip ${status.className}`;
      chip.textContent = status.label;

      titleRow.appendChild(title);
      titleRow.appendChild(chip);

      const meta = document.createElement("span");
      meta.className = "nearby-card-meta";
      meta.textContent = suggestion.distanceKm
        ? `${formatDistance(suggestion.distanceKm)} environ`
        : "Commune proche";

      const reason = document.createElement("p");
      reason.className = "nearby-card-reason";
      reason.textContent = suggestion.reason;

      button.appendChild(titleRow);
      button.appendChild(meta);
      button.appendChild(reason);
      legislationNearbyList.appendChild(button);
    });
  }
}

async function analyzeCityLegislation(targetCommune) {
  try {
    legislationState.error = "";
    legislationState.result = null;
    setLegislationLoading(true);
    setLegislationFeedback("On vérifie la commune et on prépare un résumé clair.", "loading");
    renderLegislation();

    const nearbyCommunes = await fetchNearbyCommunes(targetCommune);
    const analysis = await invokeLegislationAnalysis(targetCommune, nearbyCommunes);
    const mergedSuggestions = mergeNearbySuggestions(analysis.nearbySuggestions, nearbyCommunes);

    legislationState.result = {
      target: analysis.target,
      nearbySuggestions: mergedSuggestions,
    };
    setLegislationFeedback(
      "Analyse prête. Garde en tête qu'un dernier contrôle local reste toujours utile avant de lancer le projet.",
      "success",
    );
  } catch (error) {
    legislationState.error =
      error instanceof Error
        ? error.message
        : "Impossible d'analyser cette commune pour le moment.";
  } finally {
    setLegislationLoading(false);
    renderLegislation();
  }
}

async function handleLegislationSubmit(event) {
  event.preventDefault();

  const query = legislationCityInput.value.trim();
  if (!query) {
    legislationState.error = "Entre une commune française pour lancer l'analyse.";
    legislationState.result = null;
    renderLegislation();
    return;
  }

  try {
    legislationState.error = "";
    legislationState.result = null;
    setLegislationLoading(true);
    setLegislationFeedback("On recherche la commune la plus pertinente en France.", "loading");
    renderLegislation();

    const targetCommune = await searchFrenchCommune(query);

    if (!targetCommune) {
      throw new Error("Aucune commune française claire n'a été trouvée pour cette recherche.");
    }

    legislationCityInput.value = targetCommune.name;
    await analyzeCityLegislation(targetCommune);
  } catch (error) {
    legislationState.error =
      error instanceof Error ? error.message : "Impossible de rechercher cette commune.";
    setLegislationLoading(false);
    renderLegislation();
  }
}

function calculateMetrics(values, seasonalityKey) {
  const inputRevenue = values.revenueInput;
  const totalRevenue = activeRevenueMode === "annual" ? inputRevenue / 12 : inputRevenue;
  const annualRevenue = activeRevenueMode === "annual" ? inputRevenue : totalRevenue * 12;
  const cleaningExpense = values.cleaningCost;

  const fixedCosts = values.monthlyRent + values.utilities + cleaningExpense;

  const variableCosts = 0;
  const totalCosts = fixedCosts + variableCosts;
  const monthlyProfit = totalRevenue - totalCosts;

  const cashInvested = values.setupCost + values.securityDeposit + values.agencyFees;
  const netMargin = totalRevenue > 0 ? (monthlyProfit / totalRevenue) * 100 : 0;
  const annualRoi = cashInvested > 0 ? ((monthlyProfit * 12) / cashInvested) * 100 : 0;
  const revenueMultiplier = values.monthlyRent > 0 ? totalRevenue / values.monthlyRent : 0;
  const seasonalityProfile = SEASONALITY_PROFILES[seasonalityKey] || SEASONALITY_PROFILES[DEFAULT_SEASONALITY];
  const monthlyDetails = seasonalityProfile.distribution.map((share, index) => {
    const monthRevenue = annualRevenue * (share / 100);
    const monthVariableCosts = 0;
    const monthFixedCosts = fixedCosts;
    const monthProfit = monthRevenue - monthVariableCosts - monthFixedCosts;

    return {
      label: MONTH_LABELS[index],
      share,
      revenue: monthRevenue,
      variableCosts: monthVariableCosts,
      fixedCosts: monthFixedCosts,
      profit: monthProfit,
    };
  });
  const seasonalAnnualProfit = monthlyDetails.reduce((sum, month) => sum + month.profit, 0);

  return {
    inputRevenue,
    annualRevenue,
    lodgingRevenue: totalRevenue,
    totalRevenue,
    variableCosts,
    fixedCosts,
    monthlyProfit,
    netMargin,
    annualRoi,
    cashInvested,
    revenueMultiplier,
    seasonalityLabel: seasonalityProfile.label,
    monthlyDetails,
    seasonalAnnualProfit,
  };
}

function getSeasonalityScaleMax(values) {
  const fixedCosts = values.monthlyRent + values.utilities + values.cleaningCost;
  const annualRevenue =
    activeRevenueMode === "annual" ? values.revenueInput : values.revenueInput * 12;

  const maxMonthlyProfit = Object.values(SEASONALITY_PROFILES).reduce((currentMax, profile) => {
    const profileMax = profile.distribution.reduce((distributionMax, share) => {
      const monthRevenue = annualRevenue * (share / 100);
      const monthProfit = monthRevenue - fixedCosts;
      return Math.max(distributionMax, monthProfit);
    }, 0);

    return Math.max(currentMax, profileMax);
  }, 0);

  if (maxMonthlyProfit <= 0) {
    return 1;
  }

  // Round up to a clean step so the visual scale stays stable and readable.
  return Math.ceil(maxMonthlyProfit / 500) * 500;
}

function computeDealScore(metrics) {
  let score = 0;

  if (metrics.monthlyProfit >= 1200) {
    score += 35;
  } else if (metrics.monthlyProfit >= 700) {
    score += 28;
  } else if (metrics.monthlyProfit >= 300) {
    score += 18;
  } else if (metrics.monthlyProfit >= 0) {
    score += 10;
  }

  if (metrics.netMargin >= 28) {
    score += 25;
  } else if (metrics.netMargin >= 20) {
    score += 19;
  } else if (metrics.netMargin >= 12) {
    score += 12;
  } else if (metrics.netMargin >= 5) {
    score += 6;
  }

  if (metrics.annualRoi >= 60) {
    score += 20;
  } else if (metrics.annualRoi >= 35) {
    score += 15;
  } else if (metrics.annualRoi >= 20) {
    score += 10;
  } else if (metrics.annualRoi >= 10) {
    score += 5;
  }

  if (metrics.revenueMultiplier >= 3.5) {
    score += 20;
  } else if (metrics.revenueMultiplier >= 2.8) {
    score += 14;
  } else if (metrics.revenueMultiplier >= 2.2) {
    score += 8;
  } else if (metrics.revenueMultiplier >= 1.7) {
    score += 4;
  }

  return clamp(Math.round(score), 0, 100);
}

function getVerdict(score) {
  if (score >= 95) {
    return {
      label: "Excellent deal",
      pill: "Exceptionnel",
      className: "deal-excellent",
      ringColor: "#9b6bff",
      text: "Le deal sort clairement du lot. Les indicateurs sont excellents et le potentiel paraît exceptionnel.",
    };
  }

  if (score >= 75) {
    return {
      label: "Très bon deal",
      pill: "Fort potentiel",
      className: "deal-hot",
      ringColor: "#1888EF",
      text: "Ce scénario semble très sain pour de l'arbitrage locatif, avec une bonne marge et un loyer bien absorbé par le revenu.",
    };
  }

  if (score >= 50) {
    return {
      label: "Deal correct",
      pill: "À valider",
      className: "deal-warm",
      ringColor: "#2be18b",
      text: "Le deal peut être intéressant, mais il mérite une validation terrain plus stricte avant signature.",
    };
  }

  return {
    label: "Deal fragile",
    pill: "Risque élevé",
    className: "deal-cold",
    ringColor: "#ff6b7d",
    text: "Le scénario est trop tendu pour être confortable. Il vaut mieux renégocier ou passer sur une meilleure opportunité.",
  };
}

function updateSeasonalityButtons() {
  document.querySelectorAll(".seasonality-option").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.seasonality === activeSeasonality);
  });
}

function renderSeasonalityChart(metrics, scaleMax) {
  const chart = document.getElementById("seasonalityChart");
  const label = document.getElementById("seasonalityLabel");
  const annualProfit = document.getElementById("seasonalityAnnualProfit");
  const monthlyCashflow = document.getElementById("seasonalityMonthlyCashflow");
  const zoneHeight = 170;

  chart.innerHTML = "";
  label.textContent = metrics.seasonalityLabel;
  annualProfit.textContent = `Bénéfice annuel cumulé : ${formatCurrency(metrics.seasonalAnnualProfit)}`;
  monthlyCashflow.textContent = `Cashflow mensuel moyen : ${formatCurrency(metrics.monthlyProfit)}`;

  metrics.monthlyDetails.forEach((month) => {
    const article = document.createElement("article");
    article.className = "seasonality-month";

    const monthLabel = document.createElement("div");
    monthLabel.className = "seasonality-month-label";
    monthLabel.textContent = month.label;

    const monthShare = document.createElement("div");
    monthShare.className = "seasonality-month-share";
    monthShare.textContent = `${month.share} % du CA`;

    const zone = document.createElement("div");
    zone.className = "seasonality-bar-zone";
    zone.style.marginBottom = "12px";

    const baseline = document.createElement("div");
    baseline.className = "seasonality-baseline";
    baseline.style.bottom = "0";

    if (month.profit >= 0) {
      const bar = document.createElement("div");
      bar.className = "seasonality-bar";
      const barHeight = Math.max((month.profit / scaleMax) * zoneHeight, 4);
      bar.style.height = `${barHeight}px`;
      bar.style.bottom = "0";
      zone.appendChild(bar);
    }

    const profit = document.createElement("div");
    profit.className = `seasonality-profit ${month.profit < 0 ? "is-negative" : "is-positive"}`.trim();
    profit.textContent = formatSignedCurrency(month.profit);

    zone.appendChild(baseline);
    article.appendChild(monthLabel);
    article.appendChild(monthShare);
    article.appendChild(zone);
    article.appendChild(profit);
    chart.appendChild(article);
  });
}

function render() {
  const values = readValues();
  saveValues(values);

  const metrics = calculateMetrics(values, activeSeasonality);
  const seasonalityScaleMax = getSeasonalityScaleMax(values);
  const score = computeDealScore(metrics);
  const verdict = getVerdict(score);

  document.getElementById("heroCashflow").textContent = formatCurrency(metrics.monthlyProfit);
  document.getElementById("heroAnnualRoi").textContent = formatPercent(metrics.annualRoi);
  document.getElementById("heroVerdict").lastElementChild.textContent = verdict.label;
  document.getElementById("heroVerdict").lastElementChild.className = verdict.className;

  document.getElementById("statusPill").textContent = verdict.pill;
  document.getElementById("statusPill").className = `status-pill ${verdict.className}`;

  document.getElementById("dealScore").textContent = String(score);
  document.getElementById("scoreRing").style.background =
    `conic-gradient(${verdict.ringColor} ${score * 3.6}deg, rgba(255, 255, 255, 0.08) 0deg)`;

  document.getElementById("verdictText").textContent = verdict.text;

  document.getElementById("monthlyRevenueDisplay").textContent = formatCurrency(metrics.totalRevenue);
  document.getElementById("annualRevenue").textContent = formatCurrency(metrics.annualRevenue);
  document.getElementById("monthlyProfit").textContent = formatCurrency(metrics.monthlyProfit);
  document.getElementById("netMargin").textContent = formatPercent(metrics.netMargin);
  document.getElementById("annualRoi").textContent = formatPercent(metrics.annualRoi);
  document.getElementById("revenueMultiplier").textContent = `${percentFormatter.format(metrics.revenueMultiplier)}x`;
  document.getElementById("cashInvestedMetric").textContent = formatCurrency(metrics.cashInvested);

  updateRevenueModeButtons();
  updateRevenueContext();
  updateSeasonalityButtons();
  renderSeasonalityChart(metrics, seasonalityScaleMax);
}

async function sendMagicLink(event) {
  event.preventDefault();

  const email = authEmail.value.trim();
  if (!email) {
    setAuthMessage("Entre une adresse email valide pour recevoir le lien.", "error");
    return;
  }

  setAuthSubmitting(true);
  setAuthMessage("Envoi du lien magique en cours...");

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
      shouldCreateUser: false,
    },
  });

  setAuthSubmitting(false);

  if (error) {
    setAuthMessage(error.message || "Impossible d'envoyer le lien magique.", "error");
    return;
  }

  authForm.reset();
  setAuthMessage("Lien envoyé. Ouvre ton email puis clique sur le lien pour te connecter.", "success");
}

async function logout() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    setAuthMessage(error.message || "Impossible de te déconnecter pour le moment.", "error");
    return;
  }

  updateAuthView(null);
}

function resetValues() {
  ids.forEach((id) => {
    inputs[id].value = "0";
  });
  activeSeasonality = DEFAULT_SEASONALITY;
  activeRevenueMode = DEFAULT_REVENUE_MODE;
  localStorage.removeItem(STORAGE_KEY);
  saveSeasonality(activeSeasonality);
  saveRevenueMode(activeRevenueMode);
  render();
}

function switchRevenueMode(nextMode) {
  if (nextMode === activeRevenueMode) {
    return;
  }

  const currentRawValue = revenueInput.value.trim();
  const currentNumericValue = Number.parseFloat(currentRawValue);

  if (currentRawValue !== "" && Number.isFinite(currentNumericValue)) {
    const convertedValue = nextMode === "annual" ? currentNumericValue * 12 : currentNumericValue / 12;
    revenueInput.value = String(Math.round(convertedValue * 10) / 10);
  }

  activeRevenueMode = nextMode;
  saveRevenueMode(activeRevenueMode);
  render();
}

ids.forEach((id) => {
  inputs[id].addEventListener("input", render);
});

document.querySelectorAll(".seasonality-option").forEach((button) => {
  button.addEventListener("click", () => {
    activeSeasonality = button.dataset.seasonality;
    saveSeasonality(activeSeasonality);
    render();
  });
});

document.querySelectorAll(".revenue-mode-option").forEach((button) => {
  button.addEventListener("click", () => {
    switchRevenueMode(button.dataset.revenueMode);
  });
});

authForm.addEventListener("submit", sendMagicLink);
logoutButton.addEventListener("click", logout);
document.getElementById("resetButton").addEventListener("click", resetValues);
legislationForm.addEventListener("submit", handleLegislationSubmit);

async function initializeApp() {
  loadSavedSeasonality();
  loadSavedRevenueMode();
  loadSavedValues();
  renderLegislation();

  if (IS_LOCAL_DEV) {
    updateAuthView({
      user: {
        email: "Mode local (sans connexion)",
      },
    });
    return;
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    updateAuthView(session);
  });

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  updateAuthView(session);
}

initializeApp();
