import * as d3 from "d3";
import { prettifyFamily, formatMetricValue } from "./viewUtils";

let selectedCandidateIdState = {}; // Guarda o candidato selecionado por ano/modelo

/**
 * Inspetor de Redações.
 *
 * Renderiza os textos originais das redações (da IA e do humano de referência)
 * lado a lado, cruzando dados de métricas linguísticas e avaliação automática.
 */
export function renderEssayInspector({
  containerSelector,
  selectedModelKey,
  year,
  rawData,
  colorScale,
}) {
  const container = d3.select(containerSelector);
  container.html("");

  // Caso 1: Nenhuma seleção de ano específica
  if (year === "Todos") {
    container.html(`
      <div class="inspector-card empty-inspector">
        <div class="empty-icon">📂</div>
        <h3>Comparação de Textos Geral</h3>
        <p>Selecione um <strong>ano específico</strong> no menu superior para habilitar o Inspetor de Redações e analisar os textos gerados lado a lado com os originais humanos.</p>
      </div>
    `);
    return;
  }

  // Caso 2: Nenhum modelo clicado no scatter
  if (!selectedModelKey) {
    container.html(`
      <div class="inspector-card empty-inspector">
        <div class="empty-icon">🎯</div>
        <h3>Inspetor de Redações</h3>
        <p>Clique em qualquer ponto no <strong>scatter plot</strong> ou nas <strong>barras de ranking</strong> para analisar a redação gerada por aquele modelo e compará-la com as redações humanas de referência.</p>
      </div>
    `);
    return;
  }

  // Obter dados do ano e modelo
  const candidatesData = rawData.Candidates_Essays?.[year] || {};
  const questionStatement =
    candidatesData.Question_Statement || "Enunciado não disponível.";
  const candidates = candidatesData.Candidates || {};

  const modelYearData =
    rawData.Models_Essays?.[year]?.Models?.[selectedModelKey];
  if (!modelYearData) {
    container.html(`
      <div class="inspector-card empty-inspector">
        <div class="empty-icon">⚠️</div>
        <h3>Dados não encontrados</h3>
        <p>Não há redações salvas para o modelo <strong>${escapeHtml(selectedModelKey)}</strong> no ano <strong>${escapeHtml(year)}</strong>.</p>
      </div>
    `);
    return;
  }

  const modelEssay = modelYearData.Essay || "Texto da redação não encontrado.";
  const modelLinguistic = modelYearData["Linguistic Metrics"] || {};
  const automaticMetrics = modelYearData["Automatic Metrics"] || {};

  // Obter o candidato atualmente selecionado
  const candidateKeys = Object.keys(candidates);
  let selectedCandidateId = selectedCandidateIdState[`${year}_${selectedModelKey}`];
  if (selectedCandidateId === undefined || !candidates[selectedCandidateId]) {
    selectedCandidateId = candidateKeys[0] || null;
    if (selectedCandidateId !== null) {
      selectedCandidateIdState[`${year}_${selectedModelKey}`] = selectedCandidateId;
    }
  }

  const selectedCandidate =
    selectedCandidateId !== null ? candidates[selectedCandidateId] : null;

  // Renderizar layout principal
  const card = container
    .append("div")
    .attr("class", "inspector-card active-inspector");

  // Cabeçalho do Inspetor
  const family = selectedModelKey.split("_temp")[0];
  const tempMatch = selectedModelKey.match(/_temp(\d+)$/);
  const temperature = tempMatch
    ? (Number(tempMatch[1]) / 10).toFixed(1)
    : "N/A";

  const header = card.append("header").attr("class", "inspector-header");

  header.html(`
    <div class="inspector-title-row">
      <div class="inspector-badge" style="background: ${colorScale(family)}; box-shadow: 0 6px 20px ${colorScale(family)}40;"></div>
      <div style="flex: 1;">
        <h2 style="margin: 0 0 4px 0; font-size: 20px;">
          ${escapeHtml(prettifyFamily(family))}
        </h2>
        <div style="display: flex; gap: 12px; font-size: 12px; color: #64748b;">
          <span>📅 Ano: <strong>${escapeHtml(year)}</strong></span>
          <span>🌡️ Temperatura: <strong>T=${escapeHtml(temperature)}</strong></span>
        </div>
      </div>
    </div>
    <button id="closeInspectorBtn" class="close-inspector-btn" title="Fechar inspetor">✕</button>
  `);

  d3.select("#closeInspectorBtn").on("click", () => {
    const event = new CustomEvent("resetModelSelection");
    window.dispatchEvent(event);
  });

  // 1. Acordeão de Enunciado/Tema
  const accordion = card.append("div").attr("class", "statement-accordion");
  const accordionHeader = accordion
    .append("button")
    .attr("class", "accordion-header")
    .html(`
      <span>📖 Ver enunciado da proposta do exame (Tema da redação de ${escapeHtml(year)})</span>
      <span class="accordion-arrow">▼</span>
    `);

  const accordionContent = accordion
    .append("div")
    .attr("class", "accordion-content")
    .style("display", "none")
    .html(`<div class="statement-text">${formatStatementText(questionStatement)}</div>`);

  let isOpen = false;
  accordionHeader.on("click", () => {
    isOpen = !isOpen;
    accordionContent.style("display", isOpen ? "block" : "none");
    accordionHeader.select(".accordion-arrow").text(isOpen ? "▲" : "▼");
    accordionHeader.classed("open", isOpen);
  });

  // 2. Painel Split de Textos Lado a Lado
  const splitContainer = card.append("div").attr("class", "essay-comparison");

  // Lado Esquerdo: IA
  const leftPanel = splitContainer.append("div").attr("class", "essay-section");
  leftPanel.append("h3").html(`🤖 Redação Gerada pela IA`);
  leftPanel.append("div")
    .attr("class", "essay-text")
    .html(formatEssayText(modelEssay));

  // Lado Direito: Humano
  const rightPanel = splitContainer.append("div").attr("class", "essay-section");
  const referenceLabelRow = rightPanel
    .append("div")
    .style("margin-bottom", "12px");
  referenceLabelRow
    .append("h3")
    .style("margin", "0 0 8px 0")
    .html(`🧑‍💻 Referência Humana`);

  const referenceSelectorRow = referenceLabelRow
    .append("div")
    .style("display", "flex")
    .style("gap", "8px")
    .style("font-size", "12px");

  referenceSelectorRow
    .append("label")
    .attr("for", "candidateSelector")
    .style("color", "#64748b")
    .style("align-self", "center")
    .text("Selecionar:");

  const candSelect = referenceSelectorRow
    .append("select")
    .attr("id", "candidateSelector")
    .style("padding", "6px 8px")
    .style("border-radius", "6px")
    .style("border", "1px solid #e2e8f0")
    .style("font-size", "12px")
    .style("cursor", "pointer");

  candSelect
    .selectAll("option")
    .data(candidateKeys)
    .join("option")
    .attr("value", (d) => d)
    .property("selected", (d) => d === selectedCandidateId)
    .text((d) => {
      const candidate = candidates[d];
      const name = candidate.Name ?? `Candidato ${Number(d) + 1}`;
      return `${name} (Nota: ${candidate.Score ?? "—"})`;
    });

  rightPanel.append("div")
    .attr("class", "essay-text")
    .html(
      selectedCandidate
        ? formatEssayText(selectedCandidate.Essay)
        : "<em style='color: #94a3b8;'>Selecione um candidato acima</em>",
    );

  candSelect.on("change", (event) => {
    const val = event.target.value;
    selectedCandidateIdState[`${year}_${selectedModelKey}`] = val;
    renderEssayInspector({
      containerSelector,
      selectedModelKey,
      year,
      rawData,
      colorScale,
    });
  });

  // 3. Métricas e Comparação (Linguistic & Automatic)
  const metricsSection = card
    .append("section")
    .attr("class", "inspector-metrics");

  // Grid de Métricas de Comparação Automática (BLEU, ROUGE contra o candidato selecionado)
  const automaticGrid = metricsSection
    .append("div")
    .attr("class", "automatic-metrics-panel");
  automaticGrid.append("h5").text("Avaliação Automática (vs. Humano Selecionado)");
  const automaticBadges = automaticGrid
    .append("div")
    .attr("class", "metrics-badges-grid");

  if (selectedCandidate) {
    const candidateName = selectedCandidate.Name;
    let visibleMetrics = 0;

    // Pegar todas as chaves de métricas automáticas do JSON
    Object.entries(automaticMetrics).forEach(([metricName, candValues]) => {
      const value = candValues?.[candidateName];
      if (value !== undefined) {
        visibleMetrics += 1;

        const badge = automaticBadges
          .append("div")
          .attr("class", "metric-badge-item");

        badge
          .append("span")
          .attr("class", "metric-badge-name")
          .attr("title", metricName)
          .text(metricName);

        badge
          .append("span")
          .attr("class", "metric-badge-val")
          .text(formatMetricValue(Number(value)));
      }
    });

    if (!visibleMetrics) {
      automaticBadges.html(
        "<span class='hint'>Sem métricas automáticas para a referência selecionada.</span>",
      );
    }
  } else {
    automaticBadges.html("<span class='hint'>Nenhuma referência humana selecionada para calcular métricas.</span>");
  }

  // Tabela Comparativa de Métricas Linguísticas (IA vs Humano)
  const linguisticPanel = metricsSection
    .append("div")
    .attr("class", "linguistic-comparison-panel");
  linguisticPanel.append("h5").text("Análise Linguística");

  const table = linguisticPanel.append("table").attr("class", "linguistic-table");
  table.html(`
    <thead>
      <tr>
        <th>Métrica</th>
        <th>Modelo (IA)</th>
        <th>Candidato (Humano)</th>
      </tr>
    </thead>
    <tbody id="linguisticTableBody"></tbody>
  `);

  const tbody = d3.select("#linguisticTableBody");
  
  // Lista de métricas estruturadas com nomes amigáveis em português
  const metricDescriptions = [
    { key: "flesch", name: "Índice de Legibilidade Flesch" },
    { key: "words", name: "Quantidade de Palavras" },
    { key: "sentences", name: "Quantidade de Frases" },
    { key: "paragraphs", name: "Quantidade de Parágrafos" },
    { key: "words_per_sentence", name: "Média de palavras por frase" },
    { key: "noun_ratio", name: "Proporção de substantivos" },
    { key: "adjective_ratio", name: "Proporção de adjetivos" },
    { key: "verbs", name: "Proporção de verbos" },
    { key: "adverbs", name: "Proporção de advérbios" },
  ];

  metricDescriptions.forEach(({ key, name }) => {
    const iaVal =
      modelLinguistic[key] !== undefined ? Number(modelLinguistic[key]) : null;

    // As métricas dos candidatos estão sob Linguistic_Metrics (com underline)
    const candLinguistic = selectedCandidate?.Linguistic_Metrics || {};
    const humVal =
      candLinguistic[key] !== undefined ? Number(candLinguistic[key]) : null;

    if (iaVal !== null || humVal !== null) {
      const iaFormatted = formatLinguisticValue(key, iaVal);
      const humFormatted = formatLinguisticValue(key, humVal);
      
      // Destacar a maior diferença
      let diffClass = "";
      if (iaVal !== null && humVal !== null) {
        const diff = Math.abs(iaVal - humVal) / Math.max(iaVal, humVal, 0.001);
        if (diff > 0.3) diffClass = "high-diff";
      }

      tbody
        .append("tr")
        .attr("class", diffClass)
        .html(`
          <td class="metric-name-col">${escapeHtml(name)}</td>
          <td class="ia-val-col">${iaFormatted}</td>
          <td class="hum-val-col">${humFormatted}</td>
        `);
    }
  });
}

function formatLinguisticValue(key, value) {
  if (value === null || value === undefined) return "—";
  if (key === "words" || key === "sentences" || key === "paragraphs") {
    return value.toLocaleString("pt-BR");
  }
  if (key.endsWith("ratio") || key === "adverbs" || key === "verbs") {
    return `${(value * 100).toFixed(1)}%`;
  }
  return value.toFixed(2);
}

function formatStatementText(text) {
  if (!text) return "";
  return escapeHtml(text)
    .replaceAll("\n\n", "</p><p>")
    .replaceAll("\n", "<br>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
}

function formatEssayText(text) {
  return escapeHtml(text || "Texto não disponível.").replaceAll("\n", "<br>");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
