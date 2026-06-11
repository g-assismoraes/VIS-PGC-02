import * as d3 from "d3";
import {
  compareTemperatureObjects,
  getTooltip,
  moveTooltip,
} from "./viewUtils";

/**
 * Histograma categórico de temperatura.
 *
 * Aqui a temperatura é tratada como categoria ordinal extraída do nome do
 * modelo. A main já envia apenas os pontos considerados no estado atual.
 */
export function renderTemperatureHistogram({ container, title, caption, rows }) {
  const card = container.append("div").attr("class", "side-card");

  card.append("h3").text(title);
  card.append("p").attr("class", "chart-caption").text(caption);

  const counts = d3
    .rollups(
      rows,
      (v) => v.length,
      (d) => d.temperature_label,
    )
    .map(([temperature, count]) => ({ temperature, count }))
    .sort(compareTemperatureObjects);

  const width = 380;
  const height = 190;
  const margin = { top: 16, right: 20, bottom: 44, left: 48 };

  const svg = card
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", "100%");

  /**
   * Escalas.
   *
   * scaleBand organiza as temperaturas no eixo X e scaleLinear codifica a
   * contagem no eixo Y.
   */
  const x = d3
    .scaleBand()
    .domain(counts.map((d) => d.temperature))
    .range([margin.left, width - margin.right])
    .padding(0.32);

  const y = d3
    .scaleLinear()
    .domain([0, d3.max(counts, (d) => d.count) || 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const tooltip = getTooltip();

  svg
    .append("g")
    .selectAll("rect")
    .data(counts)
    .join("rect")
    .attr("x", (d) => x(d.temperature))
    .attr("y", (d) => y(d.count))
    .attr("width", x.bandwidth())
    .attr("height", (d) => y(0) - y(d.count))
    .attr("rx", 3)
    .attr("fill", "#0f766e")
    .attr("opacity", 0.9)
    .on("mouseover", function (event, d) {
      d3.select(this).attr("opacity", 1);

      tooltip.style("opacity", 1).html(`
        <div class="tooltip-title">Temperatura ${d.temperature}</div>

        <div class="tooltip-row tooltip-divider">
          <span class="tooltip-label">Pontos:</span>
          <span class="tooltip-val highlight">${d.count}</span>
        </div>
      `);

      moveTooltip(event);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", function () {
      d3.select(this).attr("opacity", 0.9);
      tooltip.style("opacity", 0);
    });

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .selectAll("text")
    .attr("font-size", 10)
    .attr("fill", "#475569");

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(3))
    .selectAll("text")
    .attr("font-size", 9.5)
    .attr("fill", "#475569");
}