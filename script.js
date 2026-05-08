const DEFAULTS = {
  monthlyRent: 1200,
  monthlyRevenueInput: 3500,
  setupCost: 6500,
  securityDeposit: 1200,
  agencyFees: 800,
  cleaningCost: 180,
  utilities: 180,
};

const STORAGE_KEY = "airbnb-simulator-values";
const SEASONALITY_STORAGE_KEY = "airbnb-simulator-seasonality";
const DEFAULT_SEASONALITY = "medium";
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
let activeSeasonality = DEFAULT_SEASONALITY;

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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function calculateMetrics(values, seasonalityKey) {
  const totalRevenue = values.monthlyRevenueInput;
  const annualRevenue = totalRevenue * 12;
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
  const annualRevenue = values.monthlyRevenueInput * 12;

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

  updateSeasonalityButtons();
  renderSeasonalityChart(metrics, seasonalityScaleMax);
}

function resetValues() {
  ids.forEach((id) => {
    inputs[id].value = DEFAULTS[id];
  });
  activeSeasonality = DEFAULT_SEASONALITY;
  saveSeasonality(activeSeasonality);
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

document.getElementById("resetButton").addEventListener("click", resetValues);

loadSavedSeasonality();
loadSavedValues();
render();
