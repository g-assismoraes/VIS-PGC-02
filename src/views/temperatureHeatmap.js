import * as d3 from "d3";
import {
  compareTemperatureLabels,
  formatMetricValue,
  getTooltip,
  moveTooltip,
  prettifyFamily,
  truncate,
} from "./viewUtils";

/**
 * Heatmap família × temperatura.
 *
 * As linhas representam famílias de modelos, as colunas representam
 * temperaturas e a cor representa o valor médio da métrica passada pela main.
 */
export function renderTemperatureHeatmap({
  container,
  title,
  caption,
  rows,
  metricName,
  valueAccessor,
}) {
  const card = container.append("div").attr("class", "side-card");

  card.append("h3").text(title);
  card.append("p").attr("class", "chart-caption").text(caption);

  const families = [...new Set(rows.map((d) => d.model_family))].sort();

  const temperatures = [...new Set(rows.map((d) => d.temperature_label))].sort(
    compareTemperatureLabels,
  );

  /**
   * Agregação para as células.
   *
   * Mesmo que exista mais de um ponto por família e temperatura, usamos média
   * para manter a codificação por célula única.
   */
  const valuesByFamilyTemp = d3.rollup(
    rows,
    (items) => d3.mean(items, valueAccessor),
    (d) => d.model_family,
    (d) => d.temperature_label,
  );

  const cells = [];

  families.forEach((family) => {
    temperatures.forEach((temperature) => {
      const value = valuesByFamilyTemp.get(family)?.get(temperature);

      cells.push({
        family,
        temperature,
        value,
      });
    });
  });

  const numericValues = cells
    .map((d) => d.value)
    .filter((value) => Number.isFinite(value));

  const width = 380;
  const rowHeight = 28;
  const margin = { top: 44, right: 18, bottom: 62, left: 150 };
  const height = Math.max(
    225,
    margin.top + margin.bottom + families.length * rowHeight,
  );

  const svg = card
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", "100%");

  if (!families.length || !temperatures.length || !numericValues.length) {
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#64748b")
      .attr("font-size", 12)
      .text("Sem dados suficientes para o heatmap.");
    return;
  }

  /**
   * Escalas do heatmap.
   *
   * scaleBand posiciona famílias e temperaturas como categorias.
   * scaleSequential transforma o valor numérico da métrica em cor.
   */
  const x = d3
    .scaleBand()
    .domain(temperatures)
    .range([margin.left, width - margin.right])
    .padding(0.08);

  const y = d3
    .scaleBand()
    .domain(families)
    .range([margin.top, height - margin.bottom])
    .padding(0.12);

  let [minValue, maxValue] = d3.extent(numericValues);

  if (minValue === maxValue) {
    minValue = minValue - 0.001;
    maxValue = maxValue + 0.001;
  }

  const heatColor = d3
    .scaleSequential()
    .domain([minValue, maxValue])
    .interpolator(d3.interpolateYlGnBu);

  const tooltip = getTooltip();

  svg
    .append("g")
    .selectAll("rect")
    .data(cells)
    .join("rect")
    .attr("x", (d) => x(d.temperature))
    .attr("y", (d) => y(d.family))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("rx", 4)
    .attr("fill", (d) =>
      Number.isFinite(d.value) ? heatColor(d.value) : "#e2e8f0",
    )
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1)
    .on("mouseover", function (event, d) {
      d3.select(this).attr("stroke", "#0f172a").attr("stroke-width", 1.6);

      tooltip.style("opacity", 1).html(`
        <div class="tooltip-title">${prettifyFamily(d.family)}</div>

        <div class="tooltip-row">
          <span class="tooltip-label">Temperatura:</span>
          <span class="tooltip-val">${d.temperature}</span>
        </div>

        <div class="tooltip-row tooltip-divider">
          <span class="tooltip-label">${metricName}:</span>
          <span class="tooltip-val highlight">${
            Number.isFinite(d.value) ? formatMetricValue(d.value) : "—"
          }</span>
        </div>
      `);

      moveTooltip(event);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", function () {
      d3.select(this).attr("stroke", "#ffffff").attr("stroke-width", 1);
      tooltip.style("opacity", 0);
    });

  svg
    .append("g")
    .selectAll("text")
    .data(temperatures)
    .join("text")
    .attr("x", (d) => x(d) + x.bandwidth() / 2)
    .attr("y", margin.top - 12)
    .attr("text-anchor", "middle")
    .attr("font-size", 10)
    .attr("font-weight", 750)
    .attr("fill", "#475569")
    .text((d) => `T=${d}`);

  svg
    .append("g")
    .selectAll("text")
    .data(families)
    .join("text")
    .attr("x", margin.left - 10)
    .attr("y", (d) => y(d) + y.bandwidth() / 2)
    .attr("dominant-baseline", "middle")
    .attr("text-anchor", "end")
    .attr("font-size", 9.5)
    .attr("fill", "#475569")
    .text((d) => truncate(prettifyFamily(d), 24));

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", 18)
    .attr("font-size", 10)
    .attr("font-weight", 800)
    .attr("fill", "#64748b")
    .text("Temperatura");

  renderHorizontalColorLegend({
    svg,
    width,
    margin,
    height,
    minValue,
    maxValue,
    heatColor,
    metricName,
  });
}

/**
 * Legenda horizontal de cor.
 *
 * A legenda deixa explícito como interpretar os valores do heatmap,
 * evitando depender apenas do tooltip.
 */
function renderHorizontalColorLegend({
  svg,
  width,
  margin,
  height,
  minValue,
  maxValue,
  heatColor,
  metricName,
}) {
  const gradientId = `heatmap-gradient-${Math.random()
    .toString(36)
    .slice(2)}`;

  const defs = svg.append("defs");

  const gradient = defs
    .append("linearGradient")
    .attr("id", gradientId)
    .attr("x1", "0%")
    .attr("x2", "100%")
    .attr("y1", "0%")
    .attr("y2", "0%");

  d3.range(0, 1.01, 0.1).forEach((t) => {
    gradient
      .append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", heatColor(minValue + t * (maxValue - minValue)));
  });

  const legendWidth = width - margin.left - margin.right;
  const legendHeight = 9;
  const legendX = margin.left;
  const legendY = height - 38;

  const legendScale = d3
    .scaleLinear()
    .domain([minValue, maxValue])
    .range([legendX, legendX + legendWidth]);

  svg
    .append("rect")
    .attr("x", legendX)
    .attr("y", legendY)
    .attr("width", legendWidth)
    .attr("height", legendHeight)
    .attr("rx", 4)
    .attr("fill", `url(#${gradientId})`);

  svg
    .append("g")
    .attr("transform", `translate(0,${legendY + legendHeight})`)
    .call(d3.axisBottom(legendScale).ticks(4).tickFormat(formatMetricValue))
    .selectAll("text")
    .attr("font-size", 8.5)
    .attr("fill", "#64748b");

  svg
    .append("text")
    .attr("x", legendX)
    .attr("y", legendY - 7)
    .attr("font-size", 9.5)
    .attr("font-weight", 750)
    .attr("fill", "#64748b")
    .text(`Cor = ${metricName}`);
}