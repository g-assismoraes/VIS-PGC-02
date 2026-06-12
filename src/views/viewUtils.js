import * as d3 from "d3";

/**
 * Funções auxiliares compartilhadas pelas views.
 *
 * Elas ficam separadas para evitar repetição e para manter cada subgráfico
 * concentrado apenas em sua própria lógica visual.
 */

export function formatMetricValue(value) {
  if (!Number.isFinite(value)) return "—";
  return value < 1 ? value.toFixed(4) : value.toFixed(3);
}

export function prettifyFamily(value) {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getModelCountry(modelFamily) {
  const normalized = String(modelFamily).toLowerCase();

  const countryByPrefix = [
    { prefix: "command", name: "Canadá", flag: "CA" },
    { prefix: "gemma", name: "Estados Unidos", flag: "US" },
    { prefix: "gpt", name: "Estados Unidos", flag: "US" },
    { prefix: "llama", name: "Estados Unidos", flag: "US" },
    { prefix: "mistral", name: "França", flag: "FR" },
    { prefix: "mixtral", name: "França", flag: "FR" },
    { prefix: "phi", name: "Estados Unidos", flag: "US" },
    { prefix: "qwen", name: "China", flag: "CN" },
    { prefix: "sabia", name: "Brasil", flag: "BR" },
  ];

  return (
    countryByPrefix.find(({ prefix }) => normalized.startsWith(prefix)) ?? {
      name: "Indefinido",
      flag: "--",
    }
  );
}

export function truncate(value, maxLength) {
  const text = String(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function paddedDomain(values) {
  const cleanValues = values.filter(Number.isFinite);
  let [min, max] = d3.extent(cleanValues);

  if (min === undefined || max === undefined) {
    return [0, 1];
  }

  if (min === max) {
    const delta = Math.abs(min) * 0.05 || 0.001;
    return [min - delta, max + delta];
  }

  const padding = (max - min) * 0.08;

  return [min - padding, max + padding];
}

export function compareTemperatureLabels(a, b) {
  const numericA = Number(a);
  const numericB = Number(b);

  if (Number.isFinite(numericA) && Number.isFinite(numericB)) {
    return d3.ascending(numericA, numericB);
  }

  return d3.ascending(String(a), String(b));
}

export function compareTemperatureObjects(a, b) {
  return compareTemperatureLabels(a.temperature, b.temperature);
}

export function normalizeBrushSelection(selection) {
  const [[x0, y0], [x1, y1]] = selection;

  return {
    x0: Math.min(x0, x1),
    y0: Math.min(y0, y1),
    x1: Math.max(x0, x1),
    y1: Math.max(y0, y1),
  };
}

export function isTinyArea(area) {
  return area.x1 - area.x0 < 4 || area.y1 - area.y0 < 4;
}

export function getRowsInsideBrushAreas(rows, brushAreas, xScale, yScale) {
  if (!brushAreas.length) return [];

  return rows.filter((d) => {
    const px = xScale(d.x);
    const py = yScale(d.y);

    return brushAreas.some(
      (area) =>
        px >= area.x0 &&
        px <= area.x1 &&
        py >= area.y0 &&
        py <= area.y1,
    );
  });
}

/**
 * Tooltip único para toda a aplicação.
 *
 * O D3 usa join com um único elemento para evitar criar múltiplos tooltips
 * a cada atualização de gráfico.
 */
export function getTooltip() {
  return d3
    .select("body")
    .selectAll(".chart-tooltip")
    .data([null])
    .join("div")
    .attr("class", "chart-tooltip");
}

/**
 * Posiciona o tooltip sem deixar ele sair da janela.
 *
 * Isso é importante nos gráficos laterais, porque eles ficam próximos à borda
 * direita da tela.
 */
export function moveTooltip(event) {
  const tooltip = getTooltip();

  const node = tooltip.node();
  const tooltipWidth = node?.offsetWidth || 260;
  const tooltipHeight = node?.offsetHeight || 120;

  const margin = 12;

  const viewportLeft = window.scrollX;
  const viewportTop = window.scrollY;
  const viewportRight = window.scrollX + window.innerWidth;
  const viewportBottom = window.scrollY + window.innerHeight;

  let left = event.pageX + 16;
  let top = event.pageY - 28;

  if (left + tooltipWidth + margin > viewportRight) {
    left = event.pageX - tooltipWidth - 16;
  }

  if (left < viewportLeft + margin) {
    left = viewportLeft + margin;
  }

  if (top + tooltipHeight + margin > viewportBottom) {
    top = viewportBottom - tooltipHeight - margin;
  }

  if (top < viewportTop + margin) {
    top = viewportTop + margin;
  }

  tooltip.style("left", `${left}px`).style("top", `${top}px`);
}
