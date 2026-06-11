import * as d3 from "d3";
import {
  formatMetricValue,
  getRowsInsideBrushAreas,
  getTooltip,
  isTinyArea,
  moveTooltip,
  normalizeBrushSelection,
  paddedDomain,
  prettifyFamily,
} from "./viewUtils";

/**
 * Scatter plot principal.
 *
 * Esta view recebe o estado necessário como parâmetros e devolve alterações
 * de seleção para a main por callbacks. Assim, o gerenciamento global de estado
 * fica centralizado em main.js, enquanto este arquivo cuida apenas da lógica
 * visual e interativa do scatter.
 */
export function renderScatterPlot({
  selector,
  rows,
  color,
  xMetric,
  yMetric,
  brushAreas,
  isShiftDown,
  onBrushAreasChange,
  onSelectionChange,
}) {
  const container = d3.select(selector);
  container.html("");

  const width = 960;
  const height = 720;
  const margin = { top: 42, right: 34, bottom: 84, left: 92 };

  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", "100%")
    .attr("height", "100%");

  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  if (!rows.length) {
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#64748b")
      .attr("font-size", 16)
      .text("Não há dados para essa combinação de métricas e ano.");

    onSelectionChange({
      selected: [],
      hasActiveBrush: false,
    });

    return;
  }

  /**
   * Escalas quantitativas.
   *
   * O domínio recebe uma pequena margem com paddedDomain para evitar pontos
   * colados nas bordas do gráfico.
   */
  const x = d3
    .scaleLinear()
    .domain(paddedDomain(rows.map((d) => d.x)))
    .nice()
    .range([0, plotWidth]);

  const y = d3
    .scaleLinear()
    .domain(paddedDomain(rows.map((d) => d.y)))
    .nice()
    .range([plotHeight, 0]);

  g.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(y).ticks(7).tickSize(-plotWidth).tickFormat(""))
    .selectAll("line")
    .attr("stroke", "#e2e8f0")
    .attr("stroke-dasharray", "3,3");

  g.select(".grid .domain").remove();

  const xAxisG = g
    .append("g")
    .attr("transform", `translate(0,${plotHeight})`)
    .call(d3.axisBottom(x).ticks(7));

  xAxisG.selectAll("text").attr("font-size", 12).attr("fill", "#475569");
  xAxisG.selectAll("line").attr("stroke", "#cbd5e1");
  xAxisG.select(".domain").attr("stroke", "#cbd5e1");

  const yAxisG = g.append("g").call(d3.axisLeft(y).ticks(7));

  yAxisG.selectAll("text").attr("font-size", 12).attr("fill", "#475569");
  yAxisG.selectAll("line").attr("stroke", "#cbd5e1");
  yAxisG.select(".domain").attr("stroke", "#cbd5e1");

  g.append("text")
    .attr("x", plotWidth / 2)
    .attr("y", plotHeight + 60)
    .attr("text-anchor", "middle")
    .attr("fill", "#0f172a")
    .attr("font-size", 14)
    .attr("font-weight", 800)
    .text(xMetric);

  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -plotHeight / 2)
    .attr("y", -66)
    .attr("text-anchor", "middle")
    .attr("fill", "#0f172a")
    .attr("font-size", 14)
    .attr("font-weight", 800)
    .text(yMetric);

  const tooltip = getTooltip();

  const selectionLayer = g.append("g").attr("class", "selection-layer");
  let points;
  let currentBrushAreas = [...brushAreas];

  /**
   * Atualização do DOM a partir do estado de seleção.
   *
   * O D3 atualiza os retângulos de seleção com join e também altera opacidade
   * e contorno dos pontos. A main é notificada para atualizar os subgráficos.
   */
  function updateSelections() {
    const selected = getRowsInsideBrushAreas(rows, currentBrushAreas, x, y);
    const selectedSet = new Set(selected.map((d) => d.model_key));
    const hasActiveBrush = currentBrushAreas.length > 0;

    selectionLayer
      .selectAll("rect.selection-area")
      .data(currentBrushAreas)
      .join("rect")
      .attr("class", "selection-area")
      .attr("x", (d) => d.x0)
      .attr("y", (d) => d.y0)
      .attr("width", (d) => d.x1 - d.x0)
      .attr("height", (d) => d.y1 - d.y0);

    if (points) {
      points
        .attr("stroke", (d) =>
          selectedSet.has(d.model_key) ? "#0f172a" : "#ffffff",
        )
        .attr("stroke-width", (d) =>
          selectedSet.has(d.model_key) ? 2.8 : 1.5,
        )
        .attr("opacity", (d) => {
          if (!hasActiveBrush) return 0.9;
          return selectedSet.has(d.model_key) ? 1 : 0.28;
        });
    }

    onSelectionChange({
      selected,
      hasActiveBrush,
    });
  }

  const brushLayer = g.append("g").attr("class", "brush");

  let brushShiftMode = false;

  /**
   * Brush com múltiplas regiões.
   *
   * Arrastar sem Shift substitui a seleção anterior.
   * Arrastar com Shift adiciona uma nova região. O keyModifiers(false)
   * impede que o D3 use Shift para comportamento interno e permite controlar
   * esse estado manualmente.
   */
  const brush = d3
    .brush()
    .keyModifiers(false)
    .extent([
      [0, 0],
      [plotWidth, plotHeight],
    ])
    .on("start", (event) => {
      brushShiftMode = isShiftDown() || Boolean(event.sourceEvent?.shiftKey);
    })
    .on("end", (event) => {
      if (!event.sourceEvent) return;

      const selection = event.selection;
      const shiftPressed =
        brushShiftMode || isShiftDown() || Boolean(event.sourceEvent?.shiftKey);

      if (!selection) {
        if (!shiftPressed) {
          currentBrushAreas = [];
          onBrushAreasChange(currentBrushAreas);
          updateSelections();
        }

        brushShiftMode = false;
        return;
      }

      const area = normalizeBrushSelection(selection);

      if (isTinyArea(area)) {
        if (!shiftPressed) {
          currentBrushAreas = [];
          onBrushAreasChange(currentBrushAreas);
          updateSelections();
        }

        brushLayer.call(brush.move, null);
        brushShiftMode = false;
        return;
      }

      if (shiftPressed) {
        currentBrushAreas = [...currentBrushAreas, area];
      } else {
        currentBrushAreas = [area];
      }

      onBrushAreasChange(currentBrushAreas);

      brushLayer.call(brush.move, null);
      updateSelections();
      brushShiftMode = false;
    });

  brushLayer.call(brush);

  /**
   * Pontos do scatter.
   *
   * Cada ponto representa uma variante modelo-temperatura. A cor é dada pela
   * família do modelo, definida na main, para manter consistência com os outros
   * gráficos.
   */
  points = g
    .append("g")
    .attr("class", "points")
    .selectAll("circle")
    .data(rows)
    .join("circle")
    .attr("cx", (d) => x(d.x))
    .attr("cy", (d) => y(d.y))
    .attr("r", 6.7)
    .attr("fill", (d) => color(d.model_family))
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1.5)
    .attr("opacity", 0.9)
    .on("mouseover", function (event, d) {
      d3.select(this).attr("r", 8.8).attr("opacity", 1);

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

        <div class="tooltip-row">
          <span class="tooltip-label">Ano:</span>
          <span class="tooltip-val">${d.year}</span>
        </div>

        <div class="tooltip-row tooltip-divider">
          <span class="tooltip-label">${d.xMetric}:</span>
          <span class="tooltip-val highlight">${formatMetricValue(d.x)}</span>
        </div>

        <div class="tooltip-row">
          <span class="tooltip-label">${d.yMetric}:</span>
          <span class="tooltip-val highlight">${formatMetricValue(d.y)}</span>
        </div>
      `);

      moveTooltip(event);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", function () {
      d3.select(this).attr("r", 6.7);
      tooltip.style("opacity", 0);
    });

  updateSelections();
}