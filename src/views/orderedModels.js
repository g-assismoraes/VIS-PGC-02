import * as d3 from "d3";
import {
  formatMetricValue,
  getTooltip,
  moveTooltip,
  prettifyFamily,
  truncate,
} from "./viewUtils";

/**
 * Renderiza um ranking ordenado de modelos utilizando barras horizontais.
 *
 * O componente exibe os modelos classificados de acordo com uma métrica
 * selecionada, permitindo ao usuário visualizar rapidamente os melhores
 * desempenhos dentro do conjunto atualmente filtrado.
 *
 * Também suporta seleção interativa de modelos para sincronização com
 * outros componentes da dashboard (scatter plot, inspector etc.).
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
  // Container visual do componente.
  const card = container.append("div").attr("class", "side-card");

  /**
   * Ordena os modelos em ordem decrescente segundo a métrica
   * fornecida pelo valueAccessor.
   */
  const sortedRows = [...rows].sort((a, b) =>
    d3.descending(valueAccessor(a), valueAccessor(b)),
  );

  /**
   * Aplica o limite configurado pelo usuário.
   *
   * Permite exibir:
   * - Top 5
   * - Top 10
   * - Todos os modelos disponíveis
   */
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

  /**
   * Configuração dimensional.
   *
   * A altura cresce dinamicamente conforme a quantidade
   * de modelos exibidos.
   */
  const width = 380;
  const rowHeight = 25;

  const margin = {
    top: 14,
    right: 22,
    bottom: 44,
    left: 162,
  };

  const height = Math.max(
    220,
    margin.top + margin.bottom + shownRows.length * rowHeight,
  );

  const svg = card
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", "100%");

  /**
   * Escala horizontal.
   *
   * Representa os valores da métrica utilizada
   * para compor o ranking.
   */
  const x = d3
    .scaleLinear()
    .domain([0, d3.max(shownRows, valueAccessor) || 1])
    .nice()
    .range([margin.left, width - margin.right]);

  /**
   * Escala vertical.
   *
   * Cada modelo ocupa uma faixa horizontal fixa.
   * O scaleBand simplifica o espaçamento uniforme
   * entre as barras.
   */
  const y = d3
    .scaleBand()
    .domain(shownRows.map((d) => d.model_display))
    .range([margin.top, height - margin.bottom])
    .padding(0.24);

  // Tooltip compartilhado pela aplicação.
  const tooltip = getTooltip();

  /**
   * Renderização das barras do ranking.
   *
   * Cada barra representa um modelo e seu tamanho
   * é proporcional ao valor da métrica selecionada.
   */
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

    // Cor baseada na família do modelo.
    .attr("fill", (d) => color(d.model_family))

    /**
     * Destaque visual para o modelo atualmente selecionado.
     *
     * O mesmo estado é compartilhado com outros gráficos,
     * permitindo sincronização entre componentes.
     */
    .attr("opacity", (d) =>
      d.model_key === selectedModelKey ? 1 : 0.88,
    )
    .attr("stroke", (d) =>
      d.model_key === selectedModelKey
        ? "#ff007f"
        : "transparent",
    )
    .attr("stroke-width", (d) =>
      d.model_key === selectedModelKey ? 2 : 0,
    )

    .style("cursor", onModelSelect ? "pointer" : "default")

    /**
     * Exibe detalhes completos do modelo ao passar
     * o cursor sobre uma barra.
     */
    .on("mouseover", function (event, d) {
      d3.select(this).attr("opacity", 1);

      tooltip.style("opacity", 1).html(`
        <div class="tooltip-title">${d.model_key}</div>

        <div class="tooltip-row">
          <span class="tooltip-label">Família:</span>
          <span class="tooltip-val">${prettifyFamily(
            d.model_family,
          )}</span>
        </div>

        <div class="tooltip-row">
          <span class="tooltip-label">Temperatura:</span>
          <span class="tooltip-val">${d.temperature_label}</span>
        </div>

        <div class="tooltip-row tooltip-divider">
          <span class="tooltip-label">${metricName}:</span>
          <span class="tooltip-val highlight">
            ${formatMetricValue(valueAccessor(d))}
          </span>
        </div>
      `);

      moveTooltip(event);
    })

    // Mantém o tooltip acompanhando o cursor.
    .on("mousemove", moveTooltip)

    // Restaura a aparência original ao sair da barra.
    .on("mouseout", function () {
      d3.select(this).attr("opacity", (d) =>
        d.model_key === selectedModelKey ? 1 : 0.88,
      );

      tooltip.style("opacity", 0);
    })

    /**
     * Permite selecionar ou desmarcar um modelo.
     *
     * A lógica de estado permanece fora deste componente,
     * seguindo o princípio de separação entre visualização
     * e gerenciamento de estado.
     */
    .on("click", function (event, d) {
      if (!onModelSelect) return;

      event.stopPropagation();

      const isCurrentSelected =
        d.model_key === selectedModelKey;

      onModelSelect(
        isCurrentSelected ? null : d.model_key,
      );
    });

  /**
   * Eixo Y.
   *
   * Exibe os nomes dos modelos.
   * Os nomes longos são truncados para evitar
   * sobreposição visual.
   */
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

  // Remove a linha principal do eixo para um visual mais limpo.
  svg.select(".domain").remove();

  /**
   * Eixo X.
   *
   * Representa os valores da métrica utilizada
   * para ordenar os modelos.
   */
  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(4))
    .selectAll("text")
    .attr("font-size", 9.5)
    .attr("fill", "#475569");
}