import * as d3 from "d3";
import {
  compareTemperatureObjects,
  getTooltip,
  moveTooltip,
} from "./viewUtils";

/**
 * Renderiza um histograma categórico das temperaturas utilizadas.
 *
 * Diferentemente dos histogramas numéricos, a temperatura é tratada
 * como uma variável categórica/ordinal. Cada barra representa a
 * quantidade de modelos associados a uma determinada temperatura.
 *
 * Esta visualização permite observar rapidamente a distribuição
 * das configurações de temperatura presentes no conjunto atualmente
 * selecionado pela aplicação.
 */
export function renderTemperatureHistogram({
  container,
  title,
  caption,
  rows,
}) {
  // Container visual do componente.
  const card = container.append("div").attr("class", "side-card");

  card.append("h3").text(title);
  card.append("p").attr("class", "chart-caption").text(caption);

  /**
   * Agrega os dados por temperatura.
   *
   * Para cada temperatura presente nos dados,
   * calcula-se a quantidade de ocorrências.
   *
   * O resultado é convertido para um formato
   * mais conveniente para a renderização.
   */
  const counts = d3
    .rollups(
      rows,
      (v) => v.length,
      (d) => d.temperature_label,
    )
    .map(([temperature, count]) => ({
      temperature,
      count,
    }))
    .sort(compareTemperatureObjects);

  /**
   * Configuração dimensional.
   */
  const width = 380;
  const height = 190;

  const margin = {
    top: 16,
    right: 20,
    bottom: 44,
    left: 48,
  };

  const svg = card
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", "100%");

  /**
   * Escala horizontal categórica.
   *
   * Cada temperatura ocupa uma posição fixa
   * igualmente espaçada no eixo X.
   */
  const x = d3
    .scaleBand()
    .domain(counts.map((d) => d.temperature))
    .range([margin.left, width - margin.right])
    .padding(0.32);

  /**
   * Escala vertical quantitativa.
   *
   * A altura de cada barra representa
   * a quantidade de modelos observados
   * para determinada temperatura.
   */
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(counts, (d) => d.count) || 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  // Tooltip compartilhado pela aplicação.
  const tooltip = getTooltip();

  /**
   * Renderização das barras.
   *
   * Cada barra representa uma categoria de temperatura
   * e sua frequência dentro do conjunto selecionado.
   */
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

    /**
     * Exibe detalhes da categoria ao passar o cursor.
     */
    .on("mouseover", function (event, d) {
      d3.select(this).attr("opacity", 1);

      tooltip.style("opacity", 1).html(`
        <div class="tooltip-title">
          Temperatura ${d.temperature}
        </div>

        <div class="tooltip-row tooltip-divider">
          <span class="tooltip-label">Pontos:</span>
          <span class="tooltip-val highlight">${d.count}</span>
        </div>
      `);

      moveTooltip(event);
    })

    // Mantém o tooltip acompanhando o cursor.
    .on("mousemove", moveTooltip)

    /**
     * Restaura a aparência padrão da barra
     * quando o cursor sai da área.
     */
    .on("mouseout", function () {
      d3.select(this).attr("opacity", 0.9);
      tooltip.style("opacity", 0);
    });

  /**
   * Eixo X.
   *
   * Exibe as categorias de temperatura
   * presentes nos dados.
   */
  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .selectAll("text")
    .attr("font-size", 10)
    .attr("fill", "#475569");

  /**
   * Eixo Y.
   *
   * Exibe a escala de frequências observadas.
   */
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(3))
    .selectAll("text")
    .attr("font-size", 9.5)
    .attr("fill", "#475569");
}