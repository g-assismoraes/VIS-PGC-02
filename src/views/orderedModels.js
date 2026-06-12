import * as d3 from "d3";
import {
  formatMetricValue,
  getTooltip,
  moveTooltip,
  prettifyFamily,
  truncate,
} from "./viewUtils";

/**
 * Barras ordenadas dos pontos considerados.
 *
 * O usuário pode escolher mostrar 5, 10 ou todos. A main passa rankLimit para
 * este componente, mantendo o estado fora da view.
 */
export function renderOrderedModels({
  container,
  title,
  caption,
  rows,
  color,
  metricName,
  valueAccessor,
  rankLimit,
  selectedModelKey = null,
  onModelSelect = null,
}) {
  const card = container.append("div").attr("class", "side-card");

  const sortedRows = [...rows].sort((a, b) =>
    d3.descending(valueAccessor(a), valueAccessor(b)),
  );

  const shownRows =
    rankLimit === "all"
      ? sortedRows
      : sortedRows.slice(0, Number(rankLimit));

  const shownText =
    rankLimit === "all"
      ? `Mostrando todos os ${shownRows.length} considerados.`
      : `Mostrando ${shownRows.length} de ${sortedRows.length} considerados.`;

  card.append("h3").text(title);
  card
    .append("p")
    .attr("class", "chart-caption")
    .text(`${caption} ${shownText}`);

  const width = 380;
  const rowHeight = 25;
  const margin = { top: 14, right: 22, bottom: 44, left: 162 };
  const height = Math.max(
    220,
    margin.top + margin.bottom + shownRows.length * rowHeight,
  );

  const svg = card
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", "100%");

  /**
   * Escalas.
   *
   * X representa o valor da métrica escolhida; Y organiza os modelos em ordem
   * decrescente. scaleBand facilita a altura uniforme das barras.
   */
  const x = d3
    .scaleLinear()
    .domain([0, d3.max(shownRows, valueAccessor) || 1])
    .nice()
    .range([margin.left, width - margin.right]);

  const y = d3
    .scaleBand()
    .domain(shownRows.map((d) => d.model_display))
    .range([margin.top, height - margin.bottom])
    .padding(0.24);

  const tooltip = getTooltip();

  svg
    .append("g")
    .selectAll("rect")
    .data(shownRows)
    .join("rect")
    .attr("x", margin.left)
    .attr("y", (d) => y(d.model_display))
    .attr("width", (d) => x(valueAccessor(d)) - margin.left)
    .attr("height", y.bandwidth())
    .attr("rx", 3)
    .attr("fill", (d) => color(d.model_family))
    .attr("opacity", (d) => (d.model_key === selectedModelKey ? 1 : 0.88))
    .attr("stroke", (d) =>
      d.model_key === selectedModelKey ? "#ff007f" : "transparent",
    )
    .attr("stroke-width", (d) => (d.model_key === selectedModelKey ? 2 : 0))
    .style("cursor", onModelSelect ? "pointer" : "default")
    .on("mouseover", function (event, d) {
      d3.select(this).attr("opacity", 1);

      tooltip.style("opacity", 1).html(`
        <div class="tooltip-title">${d.model_key}</div>

        <div class="tooltip-row">
          <span class="tooltip-label">Família:</span>
          <span class="tooltip-val">${prettifyFamily(d.model_family)}</span>
        </div>

        <div class="tooltip-row">
          <span class="tooltip-label">Temperatura:</span>
          <span class="tooltip-val">${d.temperature_label}</span>
        </div>

        <div class="tooltip-row tooltip-divider">
          <span class="tooltip-label">${metricName}:</span>
          <span class="tooltip-val highlight">${formatMetricValue(
            valueAccessor(d),
          )}</span>
        </div>
      `);

      moveTooltip(event);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", function () {
      d3.select(this).attr("opacity", (d) =>
        d.model_key === selectedModelKey ? 1 : 0.88,
      );
      tooltip.style("opacity", 0);
    })
    .on("click", function (event, d) {
      if (!onModelSelect) return;
      event.stopPropagation();
      const isCurrentSelected = d.model_key === selectedModelKey;
      onModelSelect(isCurrentSelected ? null : d.model_key);
    });

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(
      d3
        .axisLeft(y)
        .tickFormat((d) => truncate(d, 24))
        .tickSize(0),
    )
    .selectAll("text")
    .attr("font-size", 9.5)
    .attr("fill", "#475569");

  svg.select(".domain").remove();

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(4))
    .selectAll("text")
    .attr("font-size", 9.5)
    .attr("fill", "#475569");
}
