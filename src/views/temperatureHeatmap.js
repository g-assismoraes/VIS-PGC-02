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
 * Renderiza um heatmap relacionando famílias de modelos e temperaturas.
 *
 * O objetivo desta visualização é permitir identificar padrões de desempenho
 * entre diferentes famílias de modelos e configurações de temperatura.
 *
 * Estrutura visual:
 * - Linhas → famílias de modelos;
 * - Colunas → temperaturas;
 * - Cor → valor médio da métrica selecionada.
 *
 * Como múltiplos experimentos podem existir para uma mesma combinação
 * família-temperatura, os valores são agregados por média antes da
 * construção das células.
 */
export function renderTemperatureHeatmap({
  container,
  title,
  caption,
  rows,
  metricName,
  valueAccessor,
}) {
  // Container visual do componente.
  const card = container.append("div").attr("class", "side-card");

  card.append("h3").text(title);
  card.append("p").attr("class", "chart-caption").text(caption);

  /**
   * Conjuntos únicos utilizados para compor
   * os eixos categóricos do heatmap.
   */
  const families = [...new Set(rows.map((d) => d.model_family))].sort();

  const temperatures = [...new Set(rows.map((d) => d.temperature_label))].sort(
    compareTemperatureLabels,
  );

  /**
   * Agregação dos dados.
   *
   * Para cada combinação família × temperatura,
   * calcula-se a média da métrica analisada.
   *
   * Essa abordagem garante que cada célula represente
   * um único valor agregado.
   */
  const valuesByFamilyTemp = d3.rollup(
    rows,
    (items) => d3.mean(items, valueAccessor),
    (d) => d.model_family,
    (d) => d.temperature_label,
  );

  /**
   * Constrói explicitamente todas as células do heatmap.
   *
   * Mesmo quando não existem dados para determinada
   * combinação, a célula é criada para preservar
   * a estrutura visual da matriz.
   */
  const cells = [];

  families.forEach((family) => {
    temperatures.forEach((temperature) => {
      const value =
        valuesByFamilyTemp.get(family)?.get(temperature);

      cells.push({
        family,
        temperature,
        value,
      });
    });
  });

  /**
   * Valores válidos utilizados para construir
   * a escala de cores.
   */
  const numericValues = cells
    .map((d) => d.value)
    .filter((value) => Number.isFinite(value));

  /**
   * Configuração dimensional.
   *
   * A altura cresce conforme o número de famílias
   * presentes nos dados.
   */
  const width = 380;
  const rowHeight = 28;

  const margin = {
    top: 44,
    right: 18,
    bottom: 62,
    left: 150,
  };

  const height = Math.max(
    225,
    margin.top + margin.bottom + families.length * rowHeight,
  );

  const svg = card
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", "100%");

  /**
   * Caso não existam dados suficientes para construir
   * a matriz, exibe uma mensagem informativa.
   */
  if (
    !families.length ||
    !temperatures.length ||
    !numericValues.length
  ) {
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
   * Escala horizontal categórica.
   *
   * Posiciona cada temperatura em uma coluna.
   */
  const x = d3
    .scaleBand()
    .domain(temperatures)
    .range([margin.left, width - margin.right])
    .padding(0.08);

  /**
   * Escala vertical categórica.
   *
   * Posiciona cada família em uma linha.
   */
  const y = d3
    .scaleBand()
    .domain(families)
    .range([margin.top, height - margin.bottom])
    .padding(0.12);

  /**
   * Obtém os limites da métrica para gerar
   * o mapeamento contínuo de cores.
   */
  let [minValue, maxValue] = d3.extent(numericValues);

  /**
   * Evita problemas quando todos os valores
   * possuem exatamente o mesmo valor.
   */
  if (minValue === maxValue) {
    minValue -= 0.001;
    maxValue += 0.001;
  }

  /**
   * Escala de cor sequencial.
   *
   * Valores menores recebem tons mais claros,
   * enquanto valores maiores recebem tons mais escuros.
   */
  const heatColor = d3
    .scaleSequential()
    .domain([minValue, maxValue])
    .interpolator(d3.interpolateYlGnBu);

  const tooltip = getTooltip();

  /**
   * Renderização das células do heatmap.
   *
   * Cada retângulo representa uma combinação
   * família × temperatura.
   */
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

    /**
     * Quando não há valor disponível para uma célula,
     * utiliza-se uma cor neutra para indicar ausência
     * de dados.
     */
    .attr("fill", (d) =>
      Number.isFinite(d.value)
        ? heatColor(d.value)
        : "#e2e8f0",
    )
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1)

    /**
     * Exibe detalhes completos da célula.
     */
    .on("mouseover", function (event, d) {
      d3.select(this)
        .attr("stroke", "#0f172a")
        .attr("stroke-width", 1.6);

      tooltip.style("opacity", 1).html(`
        <div class="tooltip-title">
          ${prettifyFamily(d.family)}
        </div>

        <div class="tooltip-row">
          <span class="tooltip-label">Temperatura:</span>
          <span class="tooltip-val">${d.temperature}</span>
        </div>

        <div class="tooltip-row tooltip-divider">
          <span class="tooltip-label">${metricName}:</span>
          <span class="tooltip-val highlight">
            ${
              Number.isFinite(d.value)
                ? formatMetricValue(d.value)
                : "—"
            }
          </span>
        </div>
      `);

      moveTooltip(event);
    })

    .on("mousemove", moveTooltip)

    /**
     * Restaura a aparência padrão da célula.
     */
    .on("mouseout", function () {
      d3.select(this)
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 1);

      tooltip.style("opacity", 0);
    });

  /**
   * Cabeçalhos das colunas (temperaturas).
   */
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

  /**
   * Rótulos das linhas (famílias).
   *
   * Nomes muito longos são truncados
   * para preservar a legibilidade.
   */
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

  /**
   * Título auxiliar das colunas.
   */
  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", 18)
    .attr("font-size", 10)
    .attr("font-weight", 800)
    .attr("fill", "#64748b")
    .text("Temperatura");

  /**
   * Legenda visual que explica o mapeamento
   * entre intensidade da cor e valor da métrica.
   */
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
 * Renderiza a legenda contínua utilizada pelo heatmap.
 *
 * A legenda permite interpretar os valores representados
 * pelas cores sem depender exclusivamente do tooltip.
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
  /**
   * Identificador único para evitar conflitos
   * entre múltiplos heatmaps na mesma página.
   */
  const gradientId = `heatmap-gradient-${Math.random()
    .toString(36)
    .slice(2)}`;

  const defs = svg.append("defs");

  /**
   * Gradiente horizontal utilizado para representar
   * visualmente toda a escala de valores.
   */
  const gradient = defs
    .append("linearGradient")
    .attr("id", gradientId)
    .attr("x1", "0%")
    .attr("x2", "100%")
    .attr("y1", "0%")
    .attr("y2", "0%");

  /**
   * Amostra a escala de cor em múltiplos pontos
   * para construir a transição contínua.
   */
  d3.range(0, 1.01, 0.1).forEach((t) => {
    gradient
      .append("stop")
      .attr("offset", `${t * 100}%`)
      .attr(
        "stop-color",
        heatColor(minValue + t * (maxValue - minValue)),
      );
  });

  const legendWidth =
    width - margin.left - margin.right;

  const legendHeight = 9;
  const legendX = margin.left;
  const legendY = height - 38;

  /**
   * Escala utilizada pelo eixo da legenda.
   */
  const legendScale = d3
    .scaleLinear()
    .domain([minValue, maxValue])
    .range([legendX, legendX + legendWidth]);

  /**
   * Barra colorida da legenda.
   */
  svg
    .append("rect")
    .attr("x", legendX)
    .attr("y", legendY)
    .attr("width", legendWidth)
    .attr("height", legendHeight)
    .attr("rx", 4)
    .attr("fill", `url(#${gradientId})`);

  /**
   * Eixo numérico da legenda.
   */
  svg
    .append("g")
    .attr(
      "transform",
      `translate(0,${legendY + legendHeight})`,
    )
    .call(
      d3
        .axisBottom(legendScale)
        .ticks(4)
        .tickFormat(formatMetricValue),
    )
    .selectAll("text")
    .attr("font-size", 8.5)
    .attr("fill", "#64748b");

  /**
   * Descrição semântica da codificação visual.
   */
  svg
    .append("text")
    .attr("x", legendX)
    .attr("y", legendY - 7)
    .attr("font-size", 9.5)
    .attr("font-weight", 750)
    .attr("fill", "#64748b")
    .text(`Cor = ${metricName}`);
}