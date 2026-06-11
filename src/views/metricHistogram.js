import * as d3 from "d3";
import {
  formatMetricValue,
  getTooltip,
  moveTooltip,
  paddedDomain,
} from "./viewUtils";

/**
 * Histograma de uma métrica numérica.
 *
 * Este componente é usado duas vezes: uma para a métrica do eixo X e outra
 * para a métrica do eixo Y. A função recebe valores já filtrados pela main,
 * que decide se eles vêm do brush ou de todos os pontos.
 */
export function renderMetricHistogram({
  container,
  title,
  caption,
  values,
  colorValue,
}) {
  const card = container.append("div").attr("class", "side-card");

  card.append("h3").text(title);
  card.append("p").attr("class", "chart-caption").text(caption);

  const width = 380;
  const height = 190;
  const margin = { top: 16, right: 18, bottom: 44, left: 48 };

  const svg = card
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", "100%");

  const cleanValues = values.filter(Number.isFinite);

  if (!cleanValues.length) return;

  /**
   * Escalas do histograma.
   *
   * A escala X usa o domínio dos valores da métrica. Os bins são calculados
   * com d3.bin a partir desse domínio, e a escala Y representa a contagem de
   * pontos em cada intervalo.
   */
  const x = d3
    .scaleLinear()
    .domain(paddedDomain(cleanValues))
    .nice()
    .range([margin.left, width - margin.right]);

  const bins = d3.bin().domain(x.domain()).thresholds(8)(cleanValues);

  const y = d3
    .scaleLinear()
    .domain([0, d3.max(bins, (d) => d.length) || 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const tooltip = getTooltip();

  /**
   * Atualização do DOM com join.
   *
   * Cada bin vira um retângulo. O tooltip evita colocar muitos rótulos dentro
   * de um painel lateral pequeno.
   */
  svg
    .append("g")
    .selectAll("rect")
    .data(bins)
    .join("rect")
    .attr("x", (d) => x(d.x0) + 1)
    .attr("y", (d) => y(d.length))
    .attr("width", (d) => Math.max(0, x(d.x1) - x(d.x0) - 2))
    .attr("height", (d) => y(0) - y(d.length))
    .attr("rx", 3)
    .attr("fill", colorValue)
    .attr("opacity", 0.85)
    .on("mouseover", function (event, d) {
      d3.select(this).attr("opacity", 1);

      tooltip.style("opacity", 1).html(`
        <div class="tooltip-title">Intervalo</div>

        <div class="tooltip-row">
          <span class="tooltip-label">De:</span>
          <span class="tooltip-val">${formatMetricValue(d.x0)}</span>
        </div>

        <div class="tooltip-row">
          <span class="tooltip-label">Até:</span>
          <span class="tooltip-val">${formatMetricValue(d.x1)}</span>
        </div>

        <div class="tooltip-row tooltip-divider">
          <span class="tooltip-label">Pontos:</span>
          <span class="tooltip-val highlight">${d.length}</span>
        </div>
      `);

      moveTooltip(event);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", function () {
      d3.select(this).attr("opacity", 0.85);
      tooltip.style("opacity", 0);
    });

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(4))
    .selectAll("text")
    .attr("font-size", 9.5)
    .attr("fill", "#475569");

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(3))
    .selectAll("text")
    .attr("font-size", 9.5)
    .attr("fill", "#475569");
}